"""NVIDIA cloud ASR over gRPC (Riva protocol, hosted NVCF function).

This is separate from the self-hosted NIM HTTP provider. The hosted service is a gRPC
endpoint: ``grpc.nvcf.nvidia.com:443`` with TLS, a ``function-id`` metadata entry that
selects the model, and ``authorization: Bearer <key>`` metadata.
"""

from __future__ import annotations

import wave
from pathlib import Path

import grpc
import riva.client as riva_client

from backend.services.providers.base import ProviderError, TranscriptionProvider

DEFAULT_SERVER = "grpc.nvcf.nvidia.com:443"
ZH_TW_FUNCTION_ID = "8473f56d-51ef-473c-bb26-efd4f5def2bf"
EXPECTED_SAMPLE_RATE = 16000
EXPECTED_CHANNELS = 1
EXPECTED_SAMPLE_WIDTH_BYTES = 2

RETRYABLE_CODES = frozenset(
    {grpc.StatusCode.UNAVAILABLE, grpc.StatusCode.DEADLINE_EXCEEDED, grpc.StatusCode.RESOURCE_EXHAUSTED}
)


class NvidiaGrpcProvider(TranscriptionProvider):
    def __init__(
        self,
        *,
        server: str,
        function_id: str,
        api_key: str,
        language: str,
        timeout_seconds: float,
        use_ssl: bool = True,
        asr_service: riva_client.ASRService | None = None,
    ) -> None:
        self._api_key = api_key
        self._language = language
        self._timeout = timeout_seconds
        if asr_service is None:
            auth = riva_client.Auth(
                uri=server,
                use_ssl=use_ssl,
                metadata_args=[
                    ["function-id", function_id],
                    ["authorization", f"Bearer {api_key}"],
                ],
            )
            asr_service = riva_client.ASRService(auth)
        self._asr = asr_service

    def transcribe_file(self, wav_path: Path) -> str:
        audio_bytes = _read_pcm16_mono_16k(wav_path)
        config = riva_client.RecognitionConfig(
            encoding=riva_client.AudioEncoding.LINEAR_PCM,
            sample_rate_hertz=EXPECTED_SAMPLE_RATE,
            language_code=self._language,
            max_alternatives=1,
            enable_automatic_punctuation=True,
            audio_channel_count=EXPECTED_CHANNELS,
        )
        try:
            future = self._asr.offline_recognize(audio_bytes, config, future=True)
            response = future.result(timeout=self._timeout)
        except grpc.FutureTimeoutError as exc:
            raise ProviderError("NVIDIA gRPC 服務回應逾時", retryable=True) from exc
        except grpc.RpcError as exc:
            raise self._map_rpc_error(exc) from exc

        parts = [
            result.alternatives[0].transcript
            for result in response.results
            if result.alternatives
        ]
        return "".join(parts)

    def _map_rpc_error(self, exc: grpc.RpcError) -> ProviderError:
        code = exc.code() if hasattr(exc, "code") else None
        details = exc.details() if hasattr(exc, "details") else str(exc)
        code_name = code.name if isinstance(code, grpc.StatusCode) else "UNKNOWN"
        message = f"NVIDIA gRPC 錯誤 {code_name}：{self._redact(details or '（無詳細訊息）')}"
        return ProviderError(message, retryable=code in RETRYABLE_CODES)

    def _redact(self, text: str) -> str:
        return text.replace(self._api_key, "***") if self._api_key else text


def _read_pcm16_mono_16k(wav_path: Path) -> bytes:
    """Return raw PCM frames. The chunk pipeline always writes this format; anything else is a bug."""
    try:
        with wave.open(str(wav_path), "rb") as wav:
            if (
                wav.getnchannels() != EXPECTED_CHANNELS
                or wav.getsampwidth() != EXPECTED_SAMPLE_WIDTH_BYTES
                or wav.getframerate() != EXPECTED_SAMPLE_RATE
            ):
                raise ProviderError("音訊格式不是 16 kHz 單聲道 16-bit PCM", retryable=False)
            return wav.readframes(wav.getnframes())
    except wave.Error as exc:
        raise ProviderError("無法讀取分段 WAV 檔", retryable=False) from exc
