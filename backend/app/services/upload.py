"""Craig ZIP upload/extraction utilities."""

from __future__ import annotations

import os
import shutil
import zipfile
from pathlib import Path
from typing import Any

from app.services.sessions import (
    create_session,
    get_session_path,
    load_session,
    update_session,
)

SUPPORTED_AUDIO_EXTENSIONS = {".flac", ".wav", ".mp3", ".m4a", ".ogg"}


def _get_audio_duration(file_path: Path) -> float | None:
    try:
        import soundfile as sf

        with sf.SoundFile(str(file_path)) as f:
            return len(f) / f.samplerate
    except Exception:
        try:
            file_size = os.path.getsize(file_path)
            return file_size / (1024 * 1024) * 60
        except OSError:
            return None


def extract_craig_zip(zip_path: Path, session_id: str | None = None) -> dict[str, Any]:
    """Extract Craig Bot ZIP into a session folder."""
    if session_id:
        try:
            session = load_session(session_id)
        except FileNotFoundError:
            session = create_session(session_id=session_id)
    else:
        session = create_session(session_id=session_id)
    session_path = get_session_path(session["session_id"])

    tracks: list[dict[str, Any]] = []
    try:
        for file_path in session_path.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_AUDIO_EXTENSIONS:
                file_path.unlink(missing_ok=True)

        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(session_path)

        for file_path in session_path.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_AUDIO_EXTENSIONS:
                track_id = file_path.stem
                tracks.append(
                    {
                        "id": track_id,
                        "filename": file_path.name,
                        "file_path": str(file_path),
                        "duration": _get_audio_duration(file_path),
                    }
                )

        tracks.sort(key=lambda item: item["filename"])

    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid ZIP file") from exc
    except Exception as exc:
        if session_path.exists():
            shutil.rmtree(session_path)
        raise exc

    if not tracks:
        raise ValueError("No audio files found in ZIP archive")

    update_session(
        session["session_id"],
        {"tracks": tracks},
    )

    return {
        "session_id": session["session_id"],
        "session_path": str(session_path),
        "tracks": tracks,
    }
