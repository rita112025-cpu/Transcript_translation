"""Abstract interface every speech-to-text backend must implement."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path


class ProviderError(Exception):
    """A failed model call. ``retryable`` marks transient failures worth another attempt."""

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class ProviderNotConfiguredError(Exception):
    """The requested mode cannot run because required configuration is missing or invalid."""


class TranscriptionProvider(ABC):
    @abstractmethod
    def transcribe_file(self, wav_path: Path) -> str:
        """Transcribe a 16 kHz mono WAV file and return the raw model text."""

    def close(self) -> None:
        """Release network resources. Providers without any can keep this no-op."""
