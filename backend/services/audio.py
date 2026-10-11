"""Audio validation, format conversion and fixed-window chunking through FFmpeg.

All external tools are invoked with argument lists (never through a shell), and
uploaded file names are reduced to a basename and never placed on a command line.
"""

from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

SUPPORTED_EXTENSIONS = frozenset({".wav", ".mp3", ".m4a", ".mp4", ".flac", ".ogg"})
TARGET_SAMPLE_RATE = 16000
TARGET_CHANNELS = 1
MIN_CHUNK_SECONDS = 0.1
MAX_DISPLAY_NAME_CHARS = 200
TOOL_TIMEOUT_SECONDS = 600
PROBE_TIMEOUT_SECONDS = 60


class AudioError(Exception):
    """A user-facing audio problem (unsupported, unreadable, too long, or tool missing)."""


@dataclass(frozen=True)
class AudioInfo:
    duration_seconds: float
    sample_rate: int
    channels: int
    codec: str


@dataclass(frozen=True)
class AudioChunk:
    index: int
    start: float
    end: float
    path: Path


def tool_available(tool: str) -> bool:
    """True when the executable exists at the configured path or resolves on PATH."""
    return Path(tool).is_file() or shutil.which(tool) is not None


def normalize_extension(filename: str | None) -> str:
    ext = Path(_basename(filename)).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        label = ext or "無副檔名"
        raise AudioError(f"不支援的檔案格式：{label}。請使用 WAV、MP3、M4A、MP4、FLAC 或 OGG")
    return ext


def display_name(filename: str | None) -> str:
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", _basename(filename)).strip()
    return cleaned[:MAX_DISPLAY_NAME_CHARS] or "audio"


def _basename(filename: str | None) -> str:
    return re.split(r"[\\/]", filename or "")[-1]


def probe_audio(ffprobe: str, path: Path, max_duration_seconds: float) -> AudioInfo:
    """Confirm the file has an audio stream and a usable, bounded duration."""
    cmd = [
        ffprobe, "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
        "-of", "json", str(path),
    ]
    completed = _run(cmd, PROBE_TIMEOUT_SECONDS, "ffprobe")
    if completed.returncode != 0:
        raise AudioError("無法讀取音訊內容，檔案可能已損毀或格式不正確")

    try:
        payload = json.loads(completed.stdout.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        raise AudioError("無法解析 ffprobe 輸出") from exc

    streams = payload.get("streams") or []
    if not streams:
        raise AudioError("檔案中找不到音訊軌道")

    stream = streams[0]
    try:
        duration = float((payload.get("format") or {}).get("duration") or 0)
        sample_rate = int(stream.get("sample_rate") or 0)
        channels = int(stream.get("channels") or 0)
    except (TypeError, ValueError) as exc:
        raise AudioError("音訊參數無法辨識") from exc

    if duration <= 0:
        raise AudioError("音訊長度為 0，無法轉錄")
    if duration > max_duration_seconds:
        raise AudioError(f"音訊長度 {duration / 60:.1f} 分鐘超過上限 {max_duration_seconds / 60:.0f} 分鐘")

    return AudioInfo(
        duration_seconds=duration,
        sample_rate=sample_rate,
        channels=channels,
        codec=str(stream.get("codec_name") or "unknown"),
    )


def convert_to_model_wav(ffmpeg: str, src: Path, dst: Path) -> None:
    """Re-encode any supported input as 16 kHz mono 16-bit PCM WAV."""
    cmd = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src), "-vn",
        "-ac", str(TARGET_CHANNELS), "-ar", str(TARGET_SAMPLE_RATE),
        "-c:a", "pcm_s16le", str(dst),
    ]
    completed = _run(cmd, TOOL_TIMEOUT_SECONDS, "ffmpeg")
    if completed.returncode != 0 or not dst.exists():
        raise AudioError("音訊格式轉換失敗")


def split_fixed_windows(
    ffmpeg: str, src: Path, out_dir: Path, duration_seconds: float, chunk_seconds: float
) -> list[AudioChunk]:
    """Cut ``src`` into consecutive windows. Each window's start is its true offset in the audio.

    Windows are cut at fixed positions, so a word that straddles a boundary can be split.
    """
    chunks: list[AudioChunk] = []
    count = math.ceil(duration_seconds / chunk_seconds)
    for index in range(count):
        start = index * chunk_seconds
        end = min(duration_seconds, start + chunk_seconds)
        if end - start < MIN_CHUNK_SECONDS:
            continue

        path = out_dir / f"chunk_{index:04d}.wav"
        cmd = [
            ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{start:.3f}", "-t", f"{end - start:.3f}",
            "-i", str(src), "-c:a", "pcm_s16le", str(path),
        ]
        completed = _run(cmd, TOOL_TIMEOUT_SECONDS, "ffmpeg")
        if completed.returncode != 0 or not path.exists():
            raise AudioError(f"第 {index + 1} 段音訊切割失敗")
        chunks.append(AudioChunk(index=index, start=round(start, 3), end=round(end, 3), path=path))
    return chunks


def _run(cmd: list[str], timeout: int, tool: str) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        raise AudioError(
            f"找不到 {tool}，請安裝 FFmpeg 並加入 PATH，或在 .env 設定 FFMPEG_PATH / FFPROBE_PATH"
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise AudioError(f"{tool} 處理逾時") from exc
