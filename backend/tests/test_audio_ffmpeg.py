"""Audio pipeline tests. Real FFmpeg tests are skipped (not passed) when FFmpeg is not installed."""

from __future__ import annotations

import math
import shutil
import struct
import wave
from pathlib import Path

import pytest

from backend.config import load_settings
from backend.services import audio
from backend.services.audio import AudioError, tool_available

FFMPEG = load_settings().ffmpeg_path
FFPROBE = load_settings().ffprobe_path
requires_ffmpeg = pytest.mark.skipif(
    not (tool_available(FFMPEG) and tool_available(FFPROBE)),
    reason="FFmpeg/ffprobe not found (set FFMPEG_PATH/FFPROBE_PATH in .env): BLOCKED for real audio conversion tests",
)


def make_tone_wav(path: Path, seconds: float, rate: int = 8000) -> Path:
    """Write a synthetic sine tone (not speech). Used only to exercise the pipeline."""
    frames = int(seconds * rate)
    with wave.open(str(path), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(rate)
        samples = bytearray()
        for n in range(frames):
            value = int(8000 * math.sin(2 * math.pi * 440 * n / rate))
            samples += struct.pack("<hh", value, value)
        out.writeframes(bytes(samples))
    return path


def test_missing_ffprobe_gives_actionable_message(tmp_path: Path) -> None:
    src = tmp_path / "x.wav"
    src.write_bytes(b"not audio")
    with pytest.raises(AudioError, match="FFMPEG_PATH"):
        audio.probe_audio(str(tmp_path / "no-such-ffprobe"), src, max_duration_seconds=10)


@requires_ffmpeg
def test_probe_reports_real_stream_info(tmp_path: Path) -> None:
    src = make_tone_wav(tmp_path / "tone.wav", seconds=2.0)
    info = audio.probe_audio(FFPROBE, src, max_duration_seconds=600)
    assert info.channels == 2
    assert info.sample_rate == 8000
    assert info.duration_seconds == pytest.approx(2.0, abs=0.05)


@requires_ffmpeg
def test_probe_rejects_non_audio_bytes(tmp_path: Path) -> None:
    fake = tmp_path / "fake.wav"
    fake.write_bytes(b"this is plain text, not audio" * 10)
    with pytest.raises(AudioError):
        audio.probe_audio(FFPROBE, fake, max_duration_seconds=600)


@requires_ffmpeg
def test_probe_rejects_over_duration_limit(tmp_path: Path) -> None:
    src = make_tone_wav(tmp_path / "tone.wav", seconds=2.0)
    with pytest.raises(AudioError, match="超過上限"):
        audio.probe_audio(FFPROBE, src, max_duration_seconds=1.0)


@requires_ffmpeg
def test_convert_produces_16k_mono_pcm(tmp_path: Path) -> None:
    src = make_tone_wav(tmp_path / "stereo.wav", seconds=1.5)
    dst = tmp_path / "model.wav"
    audio.convert_to_model_wav(FFMPEG, src, dst)
    with wave.open(str(dst), "rb") as converted:
        assert converted.getnchannels() == 1
        assert converted.getframerate() == 16000
        assert converted.getsampwidth() == 2
        assert converted.getnframes() / 16000 == pytest.approx(1.5, abs=0.05)


@requires_ffmpeg
def test_split_keeps_true_offsets_and_covers_full_length(tmp_path: Path) -> None:
    src = make_tone_wav(tmp_path / "long.wav", seconds=7.0, rate=16000)
    chunks = audio.split_fixed_windows(FFMPEG, src, tmp_path, duration_seconds=7.0, chunk_seconds=3.0)
    assert [(c.start, c.end) for c in chunks] == [(0.0, 3.0), (3.0, 6.0), (6.0, 7.0)]
    for chunk in chunks:
        assert chunk.path.exists()
        with wave.open(str(chunk.path), "rb") as piece:
            assert piece.getframerate() == 16000
            assert piece.getnframes() / 16000 == pytest.approx(chunk.end - chunk.start, abs=0.05)
