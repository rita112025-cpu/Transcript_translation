"""Pure logic tests: validation helpers, retry policy, chunk-to-result assembly."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from backend.schemas import UNKNOWN_SPEAKER
from backend.services.audio import AudioChunk, AudioError, display_name, normalize_extension
from backend.services.providers.base import ProviderError, TranscriptionProvider
from backend.services.transcription import JobError, build_result, join_texts, transcribe_chunks


class ScriptedProvider(TranscriptionProvider):
    """Returns queued outcomes in order; an exception instance is raised instead of returned."""

    def __init__(self, outcomes: list[object]) -> None:
        self._outcomes = list(outcomes)
        self.calls: list[Path] = []

    def transcribe_file(self, wav_path: Path) -> str:
        self.calls.append(wav_path)
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        assert isinstance(outcome, str)
        return outcome


def _chunks(tmp_path: Path, count: int, length: float = 60.0) -> list[AudioChunk]:
    return [
        AudioChunk(index=i, start=i * length, end=(i + 1) * length, path=tmp_path / f"c{i}.wav")
        for i in range(count)
    ]


def _no_progress(done: int, total: int) -> None:
    return None


@pytest.mark.parametrize(
    "name, expected",
    [("meeting.WAV", ".wav"), ("會議 錄音.m4a", ".m4a"), ("clip.mp4", ".mp4"), ("a.flac", ".flac")],
)
def test_accepts_supported_extensions(name: str, expected: str) -> None:
    assert normalize_extension(name) == expected


@pytest.mark.parametrize("name", ["evil.exe", "noext", "archive.wav.exe", "", None])
def test_rejects_unsupported_extensions(name: str | None) -> None:
    with pytest.raises(AudioError):
        normalize_extension(name)


def test_display_name_strips_directories_and_control_chars() -> None:
    assert display_name("..\\..\\secret\\會議.wav") == "會議.wav"
    assert display_name("../../etc/a\x00b.mp3") == "ab.mp3"


def test_display_name_is_length_limited() -> None:
    assert len(display_name("x" * 500 + ".wav")) == 200


def test_join_texts_only_spaces_between_ascii_words() -> None:
    assert join_texts(["使用 SCADA", "系統", "Revit", "Navisworks"]) == "使用 SCADA系統Revit Navisworks"
    assert join_texts(["Cable", "Tray"]) == "Cable Tray"
    assert join_texts(["", "中文", ""]) == "中文"


def test_retries_transient_error_then_succeeds(tmp_path: Path) -> None:
    provider = ScriptedProvider([ProviderError("busy", retryable=True), "第一段"])
    sleeps: list[float] = []
    texts = transcribe_chunks(
        provider,
        _chunks(tmp_path, 1),
        max_retries=2,
        backoff_seconds=1.0,
        deadline=time.monotonic() + 60,
        on_progress=_no_progress,
        sleep=sleeps.append,
    )
    assert texts == ["第一段"]
    assert sleeps == [1.0]
    assert len(provider.calls) == 2


def test_gives_up_after_max_retries(tmp_path: Path) -> None:
    provider = ScriptedProvider([ProviderError("down", retryable=True)] * 3)
    with pytest.raises(JobError, match="已重試 2 次"):
        transcribe_chunks(
            provider,
            _chunks(tmp_path, 1),
            max_retries=2,
            backoff_seconds=0,
            deadline=time.monotonic() + 60,
            on_progress=_no_progress,
            sleep=lambda _: None,
        )
    assert len(provider.calls) == 3


def test_non_retryable_error_fails_immediately_without_masking(tmp_path: Path) -> None:
    provider = ScriptedProvider([ProviderError("bad request", retryable=False)])
    with pytest.raises(JobError, match="第 1 段轉錄失敗"):
        transcribe_chunks(
            provider,
            _chunks(tmp_path, 2),
            max_retries=5,
            backoff_seconds=0,
            deadline=time.monotonic() + 60,
            on_progress=_no_progress,
            sleep=lambda _: None,
        )
    assert len(provider.calls) == 1


def test_deadline_stops_remaining_chunks(tmp_path: Path) -> None:
    provider = ScriptedProvider(["a", "b"])
    with pytest.raises(JobError, match="逾時"):
        transcribe_chunks(
            provider,
            _chunks(tmp_path, 2),
            max_retries=0,
            backoff_seconds=0,
            deadline=time.monotonic() - 1,
            on_progress=_no_progress,
        )
    assert provider.calls == []


def test_progress_reports_each_chunk(tmp_path: Path) -> None:
    events: list[tuple[int, int]] = []
    transcribe_chunks(
        ScriptedProvider(["a", "b", "c"]),
        _chunks(tmp_path, 3),
        max_retries=0,
        backoff_seconds=0,
        deadline=time.monotonic() + 60,
        on_progress=lambda done, total: events.append((done, total)),
    )
    assert events == [(0, 3), (1, 3), (2, 3), (3, 3)]


def test_build_result_keeps_raw_text_and_real_offsets(tmp_path: Path) -> None:
    chunks = _chunks(tmp_path, 3, length=60.0)
    result = build_result(
        chunks,
        ["  第一段  ", "   ", "第三段 "],
        mode="local",
        source_filename="meeting.wav",
        duration_seconds=150.0,
    )
    assert [(s.start, s.end) for s in result.segments] == [(0.0, 60.0), (120.0, 180.0)]
    assert result.segments[0].raw_text == "  第一段  "
    assert result.segments[0].text == "第一段"
    assert all(s.speaker == UNKNOWN_SPEAKER for s in result.segments)
    assert result.text == "第一段第三段"
    assert [s.id for s in result.segments] == [1, 2]
    assert result.status == "completed"
    assert result.duration_seconds == 150.0
