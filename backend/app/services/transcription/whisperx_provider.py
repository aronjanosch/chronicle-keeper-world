"""WhisperX transcription provider (simplified)."""

from __future__ import annotations

import gc
import os
import platform
from pathlib import Path

os.environ["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"

import whisperx

from app.services.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
)


def get_device_config() -> tuple[str, str]:
    """Get device and compute type for WhisperX."""
    if platform.system() == "Darwin":
        return "cpu", "int8"
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda", "float16"
    except ImportError:
        pass
    return "cpu", "int8"


def _speaker_label(speaker: dict | None, fallback: str) -> str:
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


class WhisperXProvider(TranscriptionProvider):
    """WhisperX-based transcription without diarization."""

    def __init__(self, model_name: str = "large-v2", batch_size: int = 16):
        self.model_name = model_name
        self.batch_size = batch_size

    @property
    def name(self) -> str:
        return "whisperx"

    def transcribe_session(
        self,
        session_path: str | Path,
        tracks: list[dict],
        speakers: list[dict] | None = None,
        language: str = "en",
    ) -> TranscriptionResult:
        """Transcribe each track and label by speaker mapping."""
        session_path = Path(session_path)
        if not session_path.is_dir():
            raise FileNotFoundError(f"Session folder not found: {session_path}")

        speakers = speakers or []
        speaker_map = {item.get("track_id"): item for item in speakers}

        device, compute_type = get_device_config()
        batch_size = min(self.batch_size, 4) if device == "cpu" else self.batch_size

        model = whisperx.load_model(self.model_name, device, compute_type=compute_type)
        align_model, align_metadata = whisperx.load_align_model(
            language_code=language, device=device
        )

        detected_language = language
        all_segments: list[TranscriptionSegment] = []

        try:
            for track in tracks:
                track_path = Path(track["file_path"])
                if not track_path.exists():
                    continue

                audio = whisperx.load_audio(str(track_path))
                result = model.transcribe(
                    audio, batch_size=batch_size, language=language
                )
                detected_language = result.get("language", detected_language)

                aligned = whisperx.align(
                    result["segments"],
                    align_model,
                    align_metadata,
                    audio,
                    device,
                    return_char_alignments=False,
                )

                label = _speaker_label(speaker_map.get(track["id"]), track["id"])

                for seg in aligned.get("segments", []):
                    all_segments.append(
                        TranscriptionSegment(
                            text=seg.get("text", "").strip(),
                            start=seg.get("start", 0),
                            end=seg.get("end", 0),
                            speaker=label,
                            source=track["id"],
                            words=seg.get("words"),
                        )
                    )
        finally:
            del model
            del align_model
            gc.collect()

        all_segments.sort(key=lambda s: s.start)
        return TranscriptionResult(
            segments=all_segments,
            language=detected_language,
            provider=self.name,
            metadata={"model": self.model_name},
        )
