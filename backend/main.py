"""FastAPI entry point: ``uvicorn backend.main:app``."""

from __future__ import annotations

import logging
import re
import shutil
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from backend.config import Settings, get_settings
from backend.schemas import HealthResponse, JobResponse, Mode, ModelInfo
from backend.services import audio
from backend.services.audio import AudioError
from backend.services.providers.registry import AuthorizationError, authorize_mode, list_models
from backend.services.transcription import TranscriptionService

APP_VERSION = "1.0.0"
UPLOAD_CHUNK_BYTES = 1024 * 1024
JOB_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("backend")


def _remove_stale_job_dirs(work_dir: Path) -> None:
    """Delete leftover job folders from a previous run. Only 32-hex directory names are touched."""
    if not work_dir.is_dir():
        return
    for child in work_dir.iterdir():
        if child.is_dir() and JOB_ID_PATTERN.match(child.name):
            shutil.rmtree(child, ignore_errors=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.work_dir.mkdir(parents=True, exist_ok=True)
    _remove_stale_job_dirs(settings.work_dir)
    service = TranscriptionService(settings)
    app.state.service = service
    logger.info("Backend ready. Work dir: %s", settings.work_dir)
    try:
        yield
    finally:
        service.shutdown()


app = FastAPI(title="Meeting Transcriber TW API", version=APP_VERSION, lifespan=lifespan)


def _settings() -> Settings:
    return get_settings()


def _service() -> TranscriptionService:
    return app.state.service


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = _settings()
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        ffmpeg_available=shutil.which(settings.ffmpeg_path) is not None,
        ffprobe_available=shutil.which(settings.ffprobe_path) is not None,
    )


@app.get("/api/models", response_model=list[ModelInfo])
def models() -> list[ModelInfo]:
    return list_models(_settings())


@app.post("/api/transcriptions", response_model=JobResponse, status_code=202)
async def create_transcription(
    file: UploadFile = File(...),
    mode: str = Form("local"),
    consent: bool = Form(False),
) -> JobResponse:
    settings = _settings()
    if mode not in ("cloud", "local"):
        raise HTTPException(status_code=400, detail=f"不支援的推論模式：{mode}")
    selected_mode: Mode = "cloud" if mode == "cloud" else "local"

    try:
        extension = audio.normalize_extension(file.filename)
    except AudioError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    try:
        authorize_mode(selected_mode, consent, settings)
    except AuthorizationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    job_id = uuid.uuid4().hex
    work_dir = settings.work_dir / job_id
    input_path = work_dir / f"input{extension}"
    work_dir.mkdir(parents=True, exist_ok=False)
    try:
        await _save_upload(file, input_path, settings.max_upload_bytes)
    except HTTPException:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    except OSError as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        logger.exception("Failed to store upload")
        raise HTTPException(status_code=500, detail="無法儲存上傳檔案") from exc

    return _service().submit(
        job_id=job_id,
        input_path=input_path,
        source_filename=audio.display_name(file.filename),
        mode=selected_mode,
        consent=consent,
    )


async def _save_upload(file: UploadFile, destination: Path, max_bytes: int) -> None:
    written = 0
    with destination.open("wb") as out:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_BYTES)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(status_code=413, detail="檔案超過大小上限")
            out.write(chunk)
    if written == 0:
        raise HTTPException(status_code=400, detail="上傳的檔案是空的")


@app.get("/api/transcriptions/{job_id}", response_model=JobResponse)
def get_transcription(job_id: str) -> JobResponse:
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=404, detail="找不到此任務")
    job = _service().get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="找不到此任務（後端可能已重啟）")
    return job
