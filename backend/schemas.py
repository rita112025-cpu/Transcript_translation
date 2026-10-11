"""Pydantic models shared by the FastAPI routes and the transcription service."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

UNKNOWN_SPEAKER = "講者未識別"
DEFAULT_LANGUAGE = "zh-TW"

Mode = Literal["cloud", "local"]
JobStatus = Literal[
    "queued",
    "validating",
    "converting",
    "transcribing",
    "formatting",
    "completed",
    "failed",
]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    ffmpeg_available: bool
    ffprobe_available: bool


class ModelCapabilities(BaseModel):
    language: str = DEFAULT_LANGUAGE
    segment_timestamps: bool = Field(
        False, description="Self-hosted NIM HTTP response has no segments (not stated in docs)."
    )
    word_timestamps: bool = False
    punctuation: str = Field("not_stated", description="HTTP docs do not state a punctuation flag.")
    diarization: bool = False


class ModelInfo(BaseModel):
    id: str
    mode: Mode
    display_name: str
    endpoint: str
    configured: bool
    status_message: str
    requires_consent: bool
    capabilities: ModelCapabilities


class TranscriptSegment(BaseModel):
    id: int
    start: float = Field(description="Seconds from the start of the audio.")
    end: float
    speaker: str = UNKNOWN_SPEAKER
    raw_text: str = Field(description="Unmodified text returned by the model.")
    text: str = Field(description="Display text; currently only whitespace-trimmed.")
    timestamp_source: Literal["chunk_window"] = "chunk_window"


class TranscriptionResult(BaseModel):
    model: str
    language: str = DEFAULT_LANGUAGE
    mode: Mode
    source_filename: str
    text: str
    segments: list[TranscriptSegment]
    duration_seconds: float | None
    status: Literal["completed"] = "completed"


class JobProgress(BaseModel):
    completed_chunks: int
    total_chunks: int


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str
    progress: JobProgress | None = None
    error: str | None = None
    result: TranscriptionResult | None = None
    created_at: str
    updated_at: str
