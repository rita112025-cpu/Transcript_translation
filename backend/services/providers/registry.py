"""Maps the UI mode to a provider and enforces who may send audio where.

- local: self-hosted NIM container over HTTP. Must point at a loopback address so audio never
  leaves the machine.
- cloud: NVIDIA hosted ASR over gRPC. Requires ENABLE_NVIDIA_CLOUD=true, a key, the function
  settings, and explicit consent for this job. An API key alone never enables cloud mode.

``authorize_mode`` is the single gate. It is called by the HTTP endpoint and again by
``build_provider``, so no provider (and no network connection) can be created without it.
"""

from __future__ import annotations

from urllib.parse import urlparse

from backend.config import Settings
from backend.schemas import DEFAULT_LANGUAGE, Mode, ModelCapabilities, ModelInfo
from backend.services.providers.base import TranscriptionProvider
from backend.services.providers.nvidia import NvidiaNimProvider
from backend.services.providers.nvidia_grpc import NvidiaGrpcProvider

MODEL_ID = "nvidia/parakeet-ctc-0.6b-zh-tw"
MODEL_DISPLAY_NAME = "NVIDIA Parakeet CTC 0.6B zh-TW"
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


class AuthorizationError(Exception):
    """A request may not run. ``status_code`` tells the API which HTTP status to return."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


def _cloud_problem(settings: Settings) -> str | None:
    """Configuration problems only. Returns None when the cloud path is fully configured."""
    if not settings.nvidia_api_key:
        return "尚未設定 NVIDIA_API_KEY（請於後端 .env 設定，不要放在前端）"
    if not settings.nvidia_grpc_server:
        return "尚未設定 NVIDIA_GRPC_SERVER"
    if not settings.nvidia_grpc_function_id:
        return "尚未設定 NVIDIA_GRPC_FUNCTION_ID"
    return None


def _local_problem(settings: Settings) -> str | None:
    host = urlparse(settings.local_nim_base_url).hostname or ""
    if host not in LOOPBACK_HOSTS:
        return "LOCAL_NIM_BASE_URL 必須指向本機（127.0.0.1 / localhost），否則音訊會離開本機"
    return None


def authorize_mode(mode: str, consent: bool, settings: Settings) -> None:
    """Raise AuthorizationError unless this job may run in ``mode`` with this consent."""
    if mode == "cloud":
        if not settings.enable_nvidia_cloud:
            raise AuthorizationError(403, "雲端轉錄功能未啟用（後端 ENABLE_NVIDIA_CLOUD=false）")
        if not consent:
            raise AuthorizationError(400, "雲端模式需先同意：音訊將傳送至 NVIDIA 服務進行辨識")
        problem = _cloud_problem(settings)
        if problem:
            raise AuthorizationError(503, problem)
        return
    if mode == "local":
        problem = _local_problem(settings)
        if problem:
            raise AuthorizationError(503, problem)
        return
    raise AuthorizationError(400, f"不支援的推論模式：{mode}")


def build_provider(mode: Mode, settings: Settings, consent: bool) -> TranscriptionProvider:
    authorize_mode(mode, consent, settings)
    if mode == "cloud":
        return NvidiaGrpcProvider(
            server=settings.nvidia_grpc_server,
            function_id=settings.nvidia_grpc_function_id,
            api_key=settings.nvidia_api_key,
            language=DEFAULT_LANGUAGE,
            timeout_seconds=settings.request_timeout_seconds,
        )
    return NvidiaNimProvider(
        base_url=settings.local_nim_base_url,
        language=DEFAULT_LANGUAGE,
        timeout_seconds=settings.request_timeout_seconds,
    )


def list_models(settings: Settings) -> list[ModelInfo]:
    capabilities = ModelCapabilities()
    local_problem = _local_problem(settings)
    cloud_problem = None
    if not settings.enable_nvidia_cloud:
        cloud_problem = "雲端轉錄未啟用（ENABLE_NVIDIA_CLOUD=false）"
    else:
        cloud_problem = _cloud_problem(settings)
    return [
        ModelInfo(
            id=MODEL_ID,
            mode="local",
            display_name=f"{MODEL_DISPLAY_NAME}（自架 NIM）",
            endpoint=settings.local_nim_base_url,
            configured=local_problem is None,
            status_message=local_problem or "使用本機自架 NIM 容器（HTTP）；服務未啟動時轉錄會失敗並顯示錯誤",
            requires_consent=False,
            capabilities=capabilities,
        ),
        ModelInfo(
            id=MODEL_ID,
            mode="cloud",
            display_name=f"{MODEL_DISPLAY_NAME}（NVIDIA 雲端 gRPC）",
            endpoint=settings.nvidia_grpc_server or "（未設定）",
            configured=cloud_problem is None,
            status_message=cloud_problem or "已啟用；每次轉錄前仍需勾選同意，音訊將傳送至 NVIDIA 服務",
            requires_consent=True,
            capabilities=capabilities,
        ),
    ]
