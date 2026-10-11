"""Client for the NVIDIA NIM ASR HTTP API.

Endpoint and request fields follow the NVIDIA Speech NIM HTTP reference:
``POST {base}/v1/audio/transcriptions`` with multipart fields ``file`` and ``language``,
answered by ``{"text": ..., "usage": {...}}``. The docs do not describe segment or
word timestamps, so this adapter returns text only.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from backend.services.providers.base import ProviderError, TranscriptionProvider

TRANSCRIPTIONS_PATH = "/v1/audio/transcriptions"
RETRYABLE_STATUS_CODES = frozenset({429, 503})
MAX_ERROR_DETAIL_CHARS = 300


class NvidiaNimProvider(TranscriptionProvider):
    def __init__(
        self,
        *,
        base_url: str,
        language: str,
        timeout_seconds: float,
        api_key: str | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self._endpoint = base_url.rstrip("/") + TRANSCRIPTIONS_PATH
        self._language = language
        self._api_key = api_key or None
        self._headers = {"Authorization": f"Bearer {self._api_key}"} if self._api_key else {}
        self._client = client or httpx.Client(timeout=timeout_seconds)

    def close(self) -> None:
        self._client.close()

    def transcribe_file(self, wav_path: Path) -> str:
        data = {"language": self._language, "response_format": "json"}
        try:
            with wav_path.open("rb") as audio:
                response = self._client.post(
                    self._endpoint,
                    headers=self._headers,
                    data=data,
                    files={"file": (wav_path.name, audio, "audio/wav")},
                )
        except httpx.TimeoutException as exc:
            raise ProviderError("NIM 服務回應逾時", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"無法連線到 NIM 服務（{type(exc).__name__}）", retryable=True) from exc

        if response.status_code == 200:
            return self._parse_text(response)

        status = response.status_code
        retryable = status in RETRYABLE_STATUS_CODES or status >= 500
        raise ProviderError(
            f"NIM 服務回傳 HTTP {status}：{self._error_detail(response)}",
            retryable=retryable,
        )

    @staticmethod
    def _parse_text(response: httpx.Response) -> str:
        try:
            payload: Any = response.json()
        except ValueError as exc:
            raise ProviderError("NIM 回應不是合法的 JSON", retryable=False) from exc

        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str):
            raise ProviderError("NIM 回應缺少 text 欄位", retryable=False)
        return text

    def _error_detail(self, response: httpx.Response) -> str:
        detail: str
        try:
            payload = response.json()
        except ValueError:
            payload = None

        if isinstance(payload, dict) and "detail" in payload:
            detail = str(payload["detail"])
        elif isinstance(payload, dict) and isinstance(payload.get("error"), dict):
            detail = str(payload["error"].get("message", ""))
        else:
            detail = response.text

        if self._api_key:
            detail = detail.replace(self._api_key, "***")
        return detail[:MAX_ERROR_DETAIL_CHARS] or "（無詳細訊息）"
