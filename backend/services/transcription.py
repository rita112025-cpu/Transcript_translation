"""Background transcription jobs: validation → conversion → chunked model calls → result.

Job snapshots are mirrored to SQLite so finished results survive a restart. Jobs that were still
running at restart are marked failed, because the audio is not resumed. One worker thread runs jobs
in order so that the NIM service is not overloaded; API requests never wait on it.
"""

from __future__ import annotations

import logging
import shutil
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from backend.config import Settings
from backend.schemas import (
    UNKNOWN_SPEAKER,
    JobProgress,
    JobResponse,
    JobStatus,
    Mode,
    TranscriptionResult,
    TranscriptSegment,
)
from backend.services import audio
from backend.services.audio import AudioChunk, AudioError
from backend.services.providers.base import ProviderError, TranscriptionProvider
from backend.services.job_store import JobStore
from backend.services.providers.registry import MODEL_ID, AuthorizationError, authorize_mode, build_provider

logger = logging.getLogger(__name__)

MAX_RETAINED_JOBS = 50
INTERRUPTED_MESSAGE = "後端重啟，任務已中斷，請重新上傳"
STATUS_MESSAGES: dict[JobStatus, str] = {
    "queued": "等待處理",
    "validating": "音訊驗證中",
    "converting": "格式轉換中（16 kHz 單聲道 WAV）",
    "transcribing": "模型轉錄中",
    "formatting": "整理輸出",
    "completed": "完成",
    "failed": "失敗",
}


class JobError(Exception):
    """A user-facing failure that ends a job."""


ProgressCallback = Callable[[int, int], None]
ProviderFactory = Callable[[Mode, Settings, bool], TranscriptionProvider]


@dataclass
class _Job:
    job_id: str
    mode: Mode
    consent: bool
    source_filename: str
    input_path: Path
    work_dir: Path
    created_at: str
    status: JobStatus = "queued"
    message: str = STATUS_MESSAGES["queued"]
    progress: JobProgress | None = None
    error: str | None = None
    result: TranscriptionResult | None = None
    updated_at: str = field(default_factory=lambda: _now())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def join_texts(parts: list[str]) -> str:
    """Join chunk texts. Insert a space only where two ASCII words would otherwise merge."""
    result = ""
    for part in parts:
        if not part:
            continue
        if result and result[-1].isascii() and result[-1].isalnum() and part[0].isascii() and part[0].isalnum():
            result += " "
        result += part
    return result


def transcribe_chunks(
    provider: TranscriptionProvider,
    chunks: list[AudioChunk],
    *,
    max_retries: int,
    backoff_seconds: float,
    deadline: float,
    on_progress: ProgressCallback,
    sleep: Callable[[float], None] = time.sleep,
) -> list[str]:
    """Send each chunk to the provider, retrying transient failures, and return raw texts in order."""
    texts: list[str] = []
    total = len(chunks)
    for position, chunk in enumerate(chunks, start=1):
        if time.monotonic() > deadline:
            raise JobError("轉錄逾時，已停止剩餘分段")
        on_progress(position - 1, total)
        texts.append(_transcribe_one(provider, chunk, max_retries, backoff_seconds, sleep))
    on_progress(total, total)
    return texts


def _transcribe_one(
    provider: TranscriptionProvider,
    chunk: AudioChunk,
    max_retries: int,
    backoff_seconds: float,
    sleep: Callable[[float], None],
) -> str:
    attempt = 0
    while True:
        try:
            return provider.transcribe_file(chunk.path)
        except ProviderError as exc:
            if not exc.retryable:
                raise JobError(f"第 {chunk.index + 1} 段轉錄失敗：{exc}") from exc
            if attempt >= max_retries:
                raise JobError(f"第 {chunk.index + 1} 段轉錄失敗（已重試 {max_retries} 次）：{exc}") from exc
            sleep(backoff_seconds * (2**attempt))
            attempt += 1


def build_result(
    chunks: list[AudioChunk],
    raw_texts: list[str],
    *,
    mode: Mode,
    source_filename: str,
    duration_seconds: float | None,
) -> TranscriptionResult:
    segments: list[TranscriptSegment] = []
    for chunk, raw in zip(chunks, raw_texts, strict=True):
        text = raw.strip()
        if not text:
            continue
        segments.append(
            TranscriptSegment(
                id=len(segments) + 1,
                start=chunk.start,
                end=chunk.end,
                speaker=UNKNOWN_SPEAKER,
                raw_text=raw,
                text=text,
            )
        )
    return TranscriptionResult(
        model=MODEL_ID,
        mode=mode,
        source_filename=source_filename,
        text=join_texts([segment.text for segment in segments]),
        segments=segments,
        duration_seconds=duration_seconds,
    )


class TranscriptionService:
    def __init__(self, settings: Settings, provider_factory: ProviderFactory = build_provider) -> None:
        self._settings = settings
        self._provider_factory = provider_factory
        self._jobs: dict[str, _Job] = {}
        self._lock = threading.Lock()
        self._store = JobStore(settings.job_db_path)
        self._mark_interrupted_jobs()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="transcribe")

    def _mark_interrupted_jobs(self) -> None:
        for job in self._store.load_unfinished():
            logger.warning("Job %s was interrupted by a restart", job.job_id)
            self._store.save(
                job.model_copy(
                    update={
                        "status": "failed",
                        "message": STATUS_MESSAGES["failed"],
                        "progress": None,
                        "error": INTERRUPTED_MESSAGE,
                        "updated_at": _now(),
                    }
                )
            )

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def submit(
        self, *, job_id: str, input_path: Path, source_filename: str, mode: Mode, consent: bool
    ) -> JobResponse:
        work_dir = input_path.parent
        job = _Job(
            job_id=job_id,
            mode=mode,
            consent=consent,
            source_filename=source_filename,
            input_path=input_path,
            work_dir=work_dir,
            created_at=_now(),
        )
        with self._lock:
            self._prune_locked()
            self._jobs[job_id] = job
            snapshot = self._snapshot_locked(job)
            self._store.save(snapshot)
        self._executor.submit(self._run, job_id)
        return snapshot

    def get(self, job_id: str) -> JobResponse | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                return self._snapshot_locked(job)
        return self._store.load(job_id)

    def _prune_locked(self) -> None:
        finished = [j for j in self._jobs.values() if j.status in ("completed", "failed")]
        overflow = len(self._jobs) - MAX_RETAINED_JOBS + 1
        for job in sorted(finished, key=lambda j: j.updated_at)[: max(overflow, 0)]:
            self._jobs.pop(job.job_id, None)
        self._store.prune_finished(MAX_RETAINED_JOBS)

    def _set_status(
        self,
        job_id: str,
        status: JobStatus,
        *,
        message: str | None = None,
        progress: JobProgress | None = None,
        error: str | None = None,
        result: TranscriptionResult | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.status = status
            job.message = message or STATUS_MESSAGES[status]
            job.progress = progress
            job.error = error
            job.result = result
            job.updated_at = _now()
            self._store.save(self._snapshot_locked(job))

    def _snapshot_locked(self, job: _Job) -> JobResponse:
        return JobResponse(
            job_id=job.job_id,
            status=job.status,
            message=job.message,
            progress=job.progress,
            error=job.error,
            result=job.result,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )

    def _run(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            input_path, work_dir, mode, consent, source_filename = (
                job.input_path,
                job.work_dir,
                job.mode,
                job.consent,
                job.source_filename,
            )
        result: TranscriptionResult | None = None
        error: str | None = None
        try:
            result = self._process(job_id, input_path, work_dir, mode, consent, source_filename)
        except (AudioError, JobError, AuthorizationError) as exc:
            error = str(exc)
        except Exception:
            logger.exception("Transcription job %s failed unexpectedly", job_id)
            error = "內部錯誤，請查看後端日誌（logs/backend.log）"
        finally:
            # Clean up before publishing the terminal status, so a client that sees
            # "completed" or "failed" also sees that temporary files are gone.
            shutil.rmtree(work_dir, ignore_errors=True)

        if error is None:
            self._set_status(job_id, "completed", result=result)
        else:
            self._set_status(job_id, "failed", message=STATUS_MESSAGES["failed"], error=error)

    def _process(
        self,
        job_id: str,
        input_path: Path,
        work_dir: Path,
        mode: Mode,
        consent: bool,
        source_filename: str,
    ) -> TranscriptionResult:
        settings = self._settings
        # Re-check authorization in the worker, not only at upload time.
        authorize_mode(mode, consent, settings)

        self._set_status(job_id, "validating")
        audio.probe_audio(settings.ffprobe_path, input_path, settings.max_duration_seconds)

        self._set_status(job_id, "converting")
        model_wav = work_dir / "model_input_16k.wav"
        audio.convert_to_model_wav(settings.ffmpeg_path, input_path, model_wav)
        input_path.unlink(missing_ok=True)
        converted = audio.probe_audio(settings.ffprobe_path, model_wav, settings.max_duration_seconds)
        chunks = audio.split_fixed_windows(
            settings.ffmpeg_path, model_wav, work_dir, converted.duration_seconds, settings.chunk_seconds
        )
        model_wav.unlink(missing_ok=True)

        provider = self._provider_factory(mode, settings, consent)
        try:
            self._set_status(
                job_id, "transcribing", progress=JobProgress(completed_chunks=0, total_chunks=len(chunks))
            )
            deadline = time.monotonic() + settings.job_timeout_seconds
            raw_texts = transcribe_chunks(
                provider,
                chunks,
                max_retries=settings.max_retries,
                backoff_seconds=settings.retry_backoff_seconds,
                deadline=deadline,
                on_progress=lambda done, total: self._set_status(
                    job_id,
                    "transcribing",
                    message=f"模型轉錄中（{done}/{total} 段）",
                    progress=JobProgress(completed_chunks=done, total_chunks=total),
                ),
            )
        finally:
            provider.close()

        self._set_status(job_id, "formatting")
        return build_result(
            chunks,
            raw_texts,
            mode=mode,
            source_filename=source_filename,
            duration_seconds=round(converted.duration_seconds, 3),
        )
