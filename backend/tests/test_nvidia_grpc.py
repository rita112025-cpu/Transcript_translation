"""NVIDIA gRPC provider tested over a real local gRPC server (plaintext, 127.0.0.1).

The server implements the Riva ASR ``Recognize`` RPC with canned responses. It proves the
wire protocol, metadata, status-code mapping and timeouts. It is NOT NVIDIA's cloud service,
so passing these tests does not prove NVIDIA transcription works.
"""

from __future__ import annotations

import socket
import time
import wave
from collections.abc import Iterator
from concurrent import futures
from pathlib import Path

import grpc
import pytest
from riva.client.proto import riva_asr_pb2 as rasr
from riva.client.proto import riva_asr_pb2_grpc as rasr_grpc

from backend.services.providers.base import ProviderError
from backend.services.providers.nvidia_grpc import NvidiaGrpcProvider

FUNCTION_ID = "8473f56d-51ef-473c-bb26-efd4f5def2bf"
GOOD_KEY = "nvapi-good-test-key"


class FakeRiva(rasr_grpc.RivaSpeechRecognitionServicer):
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []
        self.delay_seconds = 0.0

    def Recognize(self, request: rasr.RecognizeRequest, context: grpc.ServicerContext) -> rasr.RecognizeResponse:
        metadata = dict(context.invocation_metadata())
        self.calls.append(
            {
                "metadata": metadata,
                "language": request.config.language_code,
                "sample_rate": request.config.sample_rate_hertz,
                "encoding": request.config.encoding,
                "bytes": len(request.audio),
            }
        )
        if self.delay_seconds:
            time.sleep(self.delay_seconds)
        if metadata.get("authorization") != f"Bearer {GOOD_KEY}":
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "invalid api key")
        if metadata.get("function-id") != FUNCTION_ID:
            context.abort(grpc.StatusCode.NOT_FOUND, "unknown function id")
        alternative = rasr.SpeechRecognitionAlternative(transcript="各位同事大家好", confidence=0.9)
        return rasr.RecognizeResponse(results=[rasr.SpeechRecognitionResult(alternatives=[alternative])])


@pytest.fixture()
def riva_server() -> Iterator[tuple[FakeRiva, str]]:
    servicer = FakeRiva()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    rasr_grpc.add_RivaSpeechRecognitionServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    try:
        yield servicer, f"127.0.0.1:{port}"
    finally:
        server.stop(grace=0)


def _write_wav(path: Path, *, channels: int = 1, rate: int = 16000, seconds: float = 0.5) -> Path:
    with wave.open(str(path), "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"\x00\x00" * int(rate * seconds) * channels)
    return path


def _provider(server: str, api_key: str = GOOD_KEY, timeout: float = 5.0) -> NvidiaGrpcProvider:
    return NvidiaGrpcProvider(
        server=server,
        function_id=FUNCTION_ID,
        api_key=api_key,
        language="zh-TW",
        timeout_seconds=timeout,
        use_ssl=False,
    )


def test_success_sends_zh_tw_config_metadata_and_pcm(riva_server, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    servicer, address = riva_server
    wav = _write_wav(tmp_path / "chunk.wav", seconds=0.5)

    text = _provider(address).transcribe_file(wav)

    assert text == "各位同事大家好"
    call = servicer.calls[-1]
    assert call["language"] == "zh-TW"
    assert call["sample_rate"] == 16000
    assert call["bytes"] == 16000  # 0.5 s × 16 kHz × 2 bytes; WAV header is not sent
    metadata = call["metadata"]
    assert metadata["function-id"] == FUNCTION_ID
    assert metadata["authorization"] == f"Bearer {GOOD_KEY}"


def test_wrong_key_is_non_retryable_and_key_not_echoed(riva_server, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    _, address = riva_server
    wav = _write_wav(tmp_path / "chunk.wav")
    bad_key = "nvapi-WRONG-SECRET-123"

    with pytest.raises(ProviderError) as info:
        _provider(address, api_key=bad_key).transcribe_file(wav)

    assert info.value.retryable is False
    assert "UNAUTHENTICATED" in str(info.value)
    assert bad_key not in str(info.value)


def test_unreachable_server_is_retryable(tmp_path: Path) -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        closed_port = probe.getsockname()[1]
    wav = _write_wav(tmp_path / "chunk.wav")

    with pytest.raises(ProviderError) as info:
        _provider(f"127.0.0.1:{closed_port}", timeout=5).transcribe_file(wav)

    assert info.value.retryable is True
    assert "UNAVAILABLE" in str(info.value) or "DEADLINE_EXCEEDED" in str(info.value)


def test_slow_response_times_out_as_retryable(riva_server, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    servicer, address = riva_server
    servicer.delay_seconds = 2.0
    wav = _write_wav(tmp_path / "chunk.wav")

    with pytest.raises(ProviderError) as info:
        _provider(address, timeout=0.3).transcribe_file(wav)

    assert info.value.retryable is True
    assert "逾時" in str(info.value)


def test_non_16k_chunk_is_rejected_before_any_call(riva_server, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    servicer, address = riva_server
    stereo = _write_wav(tmp_path / "stereo.wav", channels=2)
    before = len(servicer.calls)

    with pytest.raises(ProviderError, match="16 kHz"):
        _provider(address).transcribe_file(stereo)

    assert len(servicer.calls) == before
