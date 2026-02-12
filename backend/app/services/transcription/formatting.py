"""Formatting utilities for transcription output."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.services.transcription.base import TranscriptionResult


def segments_to_plain_text(segments: list[dict]) -> str:
    """Convert segments to plain text with speaker labels."""
    lines = []
    current_speaker = None

    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue

        speaker = seg.get("speaker")
        if speaker != current_speaker:
            if lines:
                lines.append("")
            if speaker:
                lines.append(f"[{speaker}]")
            current_speaker = speaker

        lines.append(text)

    return "\n".join(lines)


def _build_speaker_header(speakers: list[dict] | None) -> str:
    """Build a speaker roster header for the transcript."""
    if not speakers:
        return ""
    lines = ["Speakers:"]
    for s in speakers:
        player = s.get("player_name", "")
        character = s.get("character_name", "")
        pronouns = s.get("pronouns", "")
        if not player and not character:
            continue
        parts = []
        if player:
            parts.append(player)
        if character:
            parts.append(f"as {character}")
        if pronouns:
            parts.append(f"({pronouns})")
        lines.append(f"- {' '.join(parts)}")
    if len(lines) == 1:
        return ""
    return "\n".join(lines) + "\n\n---\n\n"


def save_plain_text_transcript(
    segments: list[dict],
    output_path: str | Path,
    speakers: list[dict] | None = None,
) -> str:
    output_path = Path(output_path)
    header = _build_speaker_header(speakers)
    content = segments_to_plain_text(segments)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header + content)

    return str(output_path)


def _sanitize_folder_name(name: str) -> str:
    return name.replace("/", "_").replace("\\", "_").replace(":", "_").replace(" ", "_")


def save_transcription_result(
    result: TranscriptionResult,
    session_path: str | Path,
    provider_model: str,
    speakers: list[dict] | None = None,
) -> tuple[list[dict], str, str]:
    """Persist a transcription result to JSON and plain text files."""
    session_path = Path(session_path)
    segments = result.get_segments_as_dicts()

    provider = result.provider
    model_short = _sanitize_folder_name(provider_model)
    subfolder_name = f"{provider}_{model_short}"

    transcription_dir = session_path / "transcriptions" / subfolder_name
    transcription_dir.mkdir(parents=True, exist_ok=True)

    transcription_data = {
        "segments": segments,
        "language": result.language,
        "provider": result.provider,
        "metadata": {
            "provider_model": provider_model,
            "transcribed_at": datetime.now().isoformat(),
            "session_path": str(session_path),
        },
    }
    json_path = transcription_dir / "transcription.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(transcription_data, f, ensure_ascii=False, indent=2)

    text_path = transcription_dir / "transcript.txt"
    save_plain_text_transcript(segments, text_path, speakers=speakers)

    return segments, str(json_path), str(text_path)
