"""Unit/contract tests for the NIM HTTP adapter using httpx.MockTransport (no network)."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from backend.services.providers.base import ProviderError
from backend.services.providers.nvidia import NvidiaNimProvider


def _provider(handler, api_key: str | None = None) -> NvidiaNimProvider:
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return NvidiaNimProvider(
        base_url="http://nim.test:9000/",
        language="zh-TW",
        timeout_seconds=5,
        api_key=api_key,
        client=client,
    )


@pytest.fixture()
def wav(tmp_path: Path) -> Path:
    path = tmp_path / "chunk_0000.wav"
    path.write_bytes(b"RIFF0000WAVEfmt ")
    return path


def test_success_posts_expected_route_and_fields(wav: Path) -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["content_type"] = request.headers["content-type"]
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = request.read()
        return httpx.Response(200, json={"text": "各位同事大家好", "usage": {"type": "duration", "seconds": 4.0}})

    text = _provider(handler).transcribe_file(wav)

    assert text == "各位同事大家好"
    assert seen["url"] == "http://nim.test:9000/v1/audio/transcriptions"
    assert str(seen["content_type"]).startswith("multipart/form-data")
    body = seen["body"]
    assert isinstance(body, bytes)
    assert b'name="language"' in body and b"zh-TW" in body
    assert b'name="file"' in body and b"chunk_0000.wav" in body
    assert seen["auth"] is None


def test_bearer_header_only_when_key_given(wav: Path) -> None:
    seen: dict[str, str | None] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"text": "ok"})

    _provider(handler, api_key="sk-test-123").transcribe_file(wav)
    assert seen["auth"] == "Bearer sk-test-123"


@pytest.mark.parametrize("status", [429, 500, 503])
def test_transient_status_is_retryable(wav: Path, status: int) -> None:
    provider = _provider(lambda r: httpx.Response(status, json={"detail": "not ready"}))
    with pytest.raises(ProviderError) as info:
        provider.transcribe_file(wav)
    assert info.value.retryable is True
    assert f"HTTP {status}" in str(info.value)


def test_client_error_is_not_retryable_and_shows_detail(wav: Path) -> None:
    provider = _provider(lambda r: httpx.Response(400, json={"detail": "Bad Request, need model or language"}))
    with pytest.raises(ProviderError) as info:
        provider.transcribe_file(wav)
    assert info.value.retryable is False
    assert "need model or language" in str(info.value)


def test_error_message_never_contains_api_key(wav: Path) -> None:
    key = "nvapi-SECRET-VALUE"
    provider = _provider(
        lambda r: httpx.Response(401, json={"detail": f"invalid key {key}"}), api_key=key
    )
    with pytest.raises(ProviderError) as info:
        provider.transcribe_file(wav)
    assert key not in str(info.value)
    assert "***" in str(info.value)


def test_timeout_is_retryable(wav: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(ProviderError) as info:
        _provider(handler).transcribe_file(wav)
    assert info.value.retryable is True


def test_connection_error_is_retryable_and_does_not_leak_url(wav: Path) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(ProviderError) as info:
        _provider(handler).transcribe_file(wav)
    assert info.value.retryable is True
    assert "nim.test" not in str(info.value)


def test_missing_text_field_is_rejected(wav: Path) -> None:
    provider = _provider(lambda r: httpx.Response(200, json={"transcript": "x"}))
    with pytest.raises(ProviderError, match="缺少 text"):
        provider.transcribe_file(wav)


def test_non_json_body_is_rejected(wav: Path) -> None:
    provider = _provider(lambda r: httpx.Response(200, content=b"<html>proxy</html>"))
    with pytest.raises(ProviderError, match="JSON"):
        provider.transcribe_file(wav)

