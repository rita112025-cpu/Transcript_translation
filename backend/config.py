"""Runtime settings read from the environment and the project-level .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
MB = 1024 * 1024


def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default).strip()


def _resolve_tool(value: str) -> str:
    """Bare command names stay on PATH lookup; relative paths are anchored to the project root."""
    if "/" not in value and "\\" not in value:
        return value
    path = Path(value)
    return str(path if path.is_absolute() else PROJECT_DIR / path)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    raise ValueError(f"{name} must be true or false")


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    return float(raw) if raw else default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default


@dataclass(frozen=True)
class Settings:
    ffmpeg_path: str
    ffprobe_path: str
    work_dir: Path
    max_upload_mb: int
    max_duration_seconds: float
    chunk_seconds: float
    job_timeout_seconds: float
    request_timeout_seconds: float
    max_retries: int
    retry_backoff_seconds: float
    local_nim_base_url: str
    enable_nvidia_cloud: bool
    nvidia_grpc_server: str
    nvidia_grpc_function_id: str
    nvidia_api_key: str
    job_db_path: Path = BACKEND_DIR / "data" / "jobs.sqlite3"
    rate_limit_per_minute: int = 3
    rate_limit_per_hour: int = 20

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * MB


def load_settings() -> Settings:
    load_dotenv(PROJECT_DIR / ".env", override=False)

    settings = Settings(
        ffmpeg_path=_resolve_tool(_env_str("FFMPEG_PATH", "ffmpeg")),
        ffprobe_path=_resolve_tool(_env_str("FFPROBE_PATH", "ffprobe")),
        work_dir=Path(_env_str("WORK_DIR", str(BACKEND_DIR / "data" / "tmp"))),
        max_upload_mb=_env_int("MAX_UPLOAD_MB", 500),
        max_duration_seconds=_env_float("MAX_DURATION_SECONDS", 4 * 3600),
        chunk_seconds=_env_float("NIM_CHUNK_SECONDS", 60),
        job_timeout_seconds=_env_float("JOB_TIMEOUT_SECONDS", 3600),
        request_timeout_seconds=_env_float("NIM_REQUEST_TIMEOUT_SECONDS", 300),
        max_retries=_env_int("NIM_MAX_RETRIES", 2),
        retry_backoff_seconds=_env_float("NIM_RETRY_BACKOFF_SECONDS", 2),
        local_nim_base_url=_env_str("LOCAL_NIM_BASE_URL", "http://127.0.0.1:9000"),
        enable_nvidia_cloud=_env_bool("ENABLE_NVIDIA_CLOUD", False),
        nvidia_grpc_server=_env_str("NVIDIA_GRPC_SERVER", "grpc.nvcf.nvidia.com:443"),
        nvidia_grpc_function_id=_env_str("NVIDIA_GRPC_FUNCTION_ID", "8473f56d-51ef-473c-bb26-efd4f5def2bf"),
        nvidia_api_key=_env_str("NVIDIA_API_KEY", ""),
        job_db_path=Path(_env_str("JOB_DB_PATH", str(BACKEND_DIR / "data" / "jobs.sqlite3"))),
        rate_limit_per_minute=_env_int("RATE_LIMIT_PER_MINUTE", 3),
        rate_limit_per_hour=_env_int("RATE_LIMIT_PER_HOUR", 20),
    )

    if settings.chunk_seconds <= 0 or settings.max_upload_mb <= 0:
        raise ValueError("NIM_CHUNK_SECONDS 與 MAX_UPLOAD_MB 必須大於 0")
    if settings.max_retries < 0 or settings.retry_backoff_seconds < 0:
        raise ValueError("NIM_MAX_RETRIES 與 NIM_RETRY_BACKOFF_SECONDS 不可為負數")
    if settings.rate_limit_per_minute < 0 or settings.rate_limit_per_hour < 0:
        raise ValueError("RATE_LIMIT_PER_MINUTE 與 RATE_LIMIT_PER_HOUR 不可為負數（0 表示停用）")
    return settings


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
