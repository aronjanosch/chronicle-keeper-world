"""Base transcription provider interfaces."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TranscriptionSegment:
    """Single transcription segment."""

    text: str
    start: float
    end: float
    speaker: str | None = None
    source: str | None = None
    words: list[dict[str, Any]] | None = None


@dataclass(frozen=True)
class TranscriptionResult:
    """Transcription result container."""

    segments: list[TranscriptionSegment]
    language: str
    provider: str
    supports_diarization: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def get_segments_as_dicts(self) -> list[dict[str, Any]]:
        return [
            {
                "text": seg.text,
                "start": seg.start,
                "end": seg.end,
                "speaker": seg.speaker,
                "source": seg.source,
                "words": seg.words,
            }
            for seg in self.segments
        ]


def speaker_label(speaker: dict | None, fallback: str) -> str:
    """Build a display label from a speaker mapping entry."""
    if not speaker:
        return fallback
    character = speaker.get("character_name")
    player = speaker.get("player_name")
    if character and player:
        return f"{character} ({player})"
    if character:
        return character
    if player:
        return player
    return fallback


class TranscriptionProvider:
    """Abstract base class for transcription providers."""

    @property
    def name(self) -> str:  # pragma: no cover - interface definition
        raise NotImplementedError

    @property
    def supports_diarization(self) -> bool:  # pragma: no cover - interface definition
        return False

    def transcribe_session(self, *args, **kwargs) -> TranscriptionResult:
        raise NotImplementedError
