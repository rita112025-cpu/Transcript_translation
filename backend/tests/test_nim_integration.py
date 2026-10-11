"""Contract check against a real, running local NIM container.

Skipped by default because it needs the container. Run it with:
    RUN_INTEGRATION=1 backend\\.venv\\Scripts\\python.exe -m pytest backend/tests/test_nim_integration.py
It only proves the HTTP contract (request accepted, text field returned). It says nothing about accuracy.
"""

from __future__ import annotations

import os
import wave
from pathlib import Path

import pytest

from backend.config import load_settings
from backend.schemas import DEFAULT_LANGUAGE
from backend.services.providers.nvidia import NvidiaNimProvider

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1",
    reason="needs a running local NIM container; set RUN_INTEGRATION=1 to run",
)


def _write_silent_mono_16k_wav(path: Path, seconds: float) -> Path:
    """The model input format is 16 kHz mono 16-bit PCM, matching the production pipeline."""
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(b"\x00\x00" * int(seconds * 16000))
    return path


def test_local_nim_returns_text_for_a_wav_chunk(tmp_path: Path) -> None:
    settings = load_settings()
    wav = _write_silent_mono_16k_wav(tmp_path / "silence.wav", seconds=2.0)
    provider = NvidiaNimProvider(
        base_url=settings.local_nim_base_url,
        language=DEFAULT_LANGUAGE,
        timeout_seconds=settings.request_timeout_seconds,
    )
    try:
        text = provider.transcribe_file(wav)
    finally:
        provider.close()

    assert isinstance(text, str)
