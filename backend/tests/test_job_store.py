"""Job persistence: snapshots survive a restart, and jobs cut off by a restart are marked failed."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from backend.config import Settings
from backend.schemas import JobResponse
from backend.services.job_store import JobStore
from backend.services.transcription import INTERRUPTED_MESSAGE, TranscriptionService

JOB_ID = "ab" * 16


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        ffmpeg_path="ffmpeg",
        ffprobe_path="ffprobe",
        work_dir=tmp_path / "work",
        max_upload_mb=500,
        max_duration_seconds=3600,
        chunk_seconds=60,
        job_timeout_seconds=60,
        request_timeout_seconds=5,
        max_retries=0,
        retry_backoff_seconds=0,
        local_nim_base_url="http://127.0.0.1:9",
        enable_nvidia_cloud=False,
        nvidia_grpc_server="grpc.nvcf.nvidia.com:443",
        nvidia_grpc_function_id="8473f56d-51ef-473c-bb26-efd4f5def2bf",
        nvidia_api_key="",
        job_db_path=tmp_path / "jobs.sqlite3",
    )


def _snapshot(job_id: str, status: str, updated_at: str = "2026-01-01T00:00:00+00:00") -> JobResponse:
    return JobResponse(
        job_id=job_id,
        status=status,  # type: ignore[arg-type]
        message=status,
        created_at="2026-01-01T00:00:00+00:00",
        updated_at=updated_at,
    )


def test_save_and_load_round_trip(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    store.save(_snapshot(JOB_ID, "completed"))

    loaded = JobStore(tmp_path / "jobs.sqlite3").load(JOB_ID)

    assert loaded is not None
    assert loaded.status == "completed"


def test_prune_keeps_unfinished_jobs_and_newest_finished_jobs(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    running = "cd" * 16
    store.save(_snapshot(running, "transcribing", updated_at="2025-01-01T00:00:00+00:00"))
    store.save(_snapshot("01" * 16, "completed", updated_at="2026-01-01T00:00:00+00:00"))
    store.save(_snapshot("02" * 16, "failed", updated_at="2026-01-02T00:00:00+00:00"))

    store.prune_finished(keep=1)

    assert store.load("01" * 16) is None
    assert store.load("02" * 16) is not None
    assert store.load(running) is not None


def test_service_restart_marks_unfinished_job_failed_and_keeps_finished_one(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    store = JobStore(settings.job_db_path)
    store.save(_snapshot("01" * 16, "completed"))
    store.save(_snapshot(JOB_ID, "transcribing"))

    service = TranscriptionService(settings)
    try:
        interrupted = service.get(JOB_ID)
        finished = service.get("01" * 16)
    finally:
        service.shutdown()

    assert interrupted is not None
    assert interrupted.status == "failed"
    assert interrupted.error == INTERRUPTED_MESSAGE
    assert interrupted.progress is None
    assert finished is not None
    assert finished.status == "completed"


def test_unknown_job_is_not_found_after_restart(tmp_path: Path) -> None:
    service = TranscriptionService(_settings(tmp_path))
    try:
        assert service.get(JOB_ID) is None
    finally:
        service.shutdown()


def test_creates_missing_database_directory(tmp_path: Path) -> None:
    settings = replace(_settings(tmp_path), job_db_path=tmp_path / "nested" / "jobs.sqlite3")
    service = TranscriptionService(settings)
    service.shutdown()

    assert settings.job_db_path.exists()
