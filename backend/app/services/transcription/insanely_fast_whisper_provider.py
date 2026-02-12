"""Insanely Fast Whisper provider using the CLI."""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.logging_config import get_logger
from app.services.transcription.base import (
    TranscriptionProvider,
    TranscriptionResult,
    TranscriptionSegment,
)

log = get_logger("ifw")

DEFAULT_MODEL = os.getenv("CK_IFW_MODEL")
DEFAULT_DEVICE_ID = os.getenv("CK_IFW_DEVICE_ID")
DEFAULT_BATCH_SIZE = os.getenv("CK_IFW_BATCH_SIZE")
DEFAULT_FLASH = os.getenv("CK_IFW_FLASH")
DEFAULT_TIMESTAMP = os.getenv("CK_IFW_TIMESTAMP")


def _default_device_id() -> str | None:
    if DEFAULT_DEVICE_ID:
        return DEFAULT_DEVICE_ID
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        return "mps"
    return None


def _default_batch_size(device_id: str | None) -> int | None:
    if DEFAULT_BATCH_SIZE:
        return int(DEFAULT_BATCH_SIZE)
    if device_id == "mps":
        return 4
    return None


def _parse_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    return value.strip().lower() in {"1", "true", "yes", "on"}


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


class InsanelyFastWhisperProvider(TranscriptionProvider):
    """Insanely Fast Whisper CLI provider (no diarization)."""

    def __init__(
        self,
        model_name: str | None = None,
        device_id: str | None = None,
        batch_size: int | None = None,
        flash: bool | None = None,
        timestamp: str | None = None,
        hf_token: str | None = None,
        **kwargs,
    ):
        self.model_name = model_name or DEFAULT_MODEL or "openai/whisper-large-v3"
        self.device_id = device_id or _default_device_id()
        self.batch_size = batch_size or _default_batch_size(self.device_id)
        self.flash = flash if flash is not None else _parse_bool(DEFAULT_FLASH)
        self.timestamp = timestamp or DEFAULT_TIMESTAMP
        self.hf_token = hf_token
        self._cli_path = shutil.which("insanely-fast-whisper")

    @property
    def name(self) -> str:
        return "insanely-fast-whisper"

    @property
    def supports_diarization(self) -> bool:
        return False

    def _ensure_cli(self) -> None:
        if self._cli_path:
            return
        raise ImportError(
            "insanely-fast-whisper CLI not found. Install with:\n"
            "pipx install insanely-fast-whisper\n"
            "Or: uv pip install insanely-fast-whisper"
        )

    def _parse_output(self, data: dict, language: str) -> list[TranscriptionSegment]:
        segments: list[TranscriptionSegment] = []

        if isinstance(data.get("segments"), list):
            for seg in data["segments"]:
                text = str(seg.get("text", "")).strip()
                if not text:
                    continue
                segments.append(
                    TranscriptionSegment(
                        text=text,
                        start=float(seg.get("start", 0)),
                        end=float(seg.get("end", 0)),
                        speaker=seg.get("speaker"),
                        words=seg.get("words"),
                    )
                )
            return segments

        if isinstance(data.get("chunks"), list):
            for chunk in data["chunks"]:
                text = str(chunk.get("text", "")).strip()
                if not text:
                    continue
                timestamp = chunk.get("timestamp") or chunk.get("timestamps") or []
                start = float(timestamp[0]) if len(timestamp) > 0 and timestamp[0] is not None else 0.0
                end = float(timestamp[1]) if len(timestamp) > 1 and timestamp[1] is not None else start
                segments.append(
                    TranscriptionSegment(
                        text=text,
                        start=start,
                        end=end,
                        speaker=None,
                    )
                )
            return segments

        text = str(data.get("text", "")).strip()
        if text:
            segments.append(
                TranscriptionSegment(
                    text=text,
                    start=0.0,
                    end=0.0,
                    speaker=None,
                )
            )
        return segments

    def _transcribe_file(
        self,
        audio_path: Path,
        language: str,
    ) -> tuple[list[TranscriptionSegment], str, str]:
        """Transcribe a single audio file. Returns (segments, detected_language, model_used)."""
        self._ensure_cli()

        def run_cli(requested_language: str | None) -> dict:
            with tempfile.TemporaryDirectory() as tmpdir:
                transcript_path = Path(tmpdir) / "output.json"
                command = [
                    self._cli_path,
                    "--file-name",
                    str(audio_path),
                    "--transcript-path",
                    str(transcript_path),
                ]

                if self.model_name:
                    command += ["--model-name", self.model_name]
                if requested_language:
                    command += ["--language", requested_language]
                if self.device_id:
                    command += ["--device-id", self.device_id]
                if self.batch_size is not None:
                    command += ["--batch-size", str(self.batch_size)]
                if self.flash is not None:
                    command += ["--flash", str(self.flash)]
                if self.timestamp:
                    command += ["--timestamp", self.timestamp]
                if self.hf_token:
                    command += ["--hf-token", self.hf_token]

                log.info("Running: %s", " ".join(command))
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                )
                output_lines: list[str] = []
                assert process.stdout is not None
                for line in process.stdout:
                    cleaned = line.rstrip()
                    output_lines.append(cleaned)
                    log.debug("[ifw] %s", cleaned)

                return_code = process.wait()
                if return_code != 0:
                    output = "\n".join(output_lines).strip()
                    raise RuntimeError(
                        f"insanely-fast-whisper failed ({return_code}): {output}"
                    )

                if not transcript_path.exists():
                    raise FileNotFoundError(
                        "insanely-fast-whisper did not write transcript output."
                    )

                with open(transcript_path, "r", encoding="utf-8") as handle:
                    return json.load(handle)

        used_language = language
        try:
            data = run_cli(used_language)
        except RuntimeError as exc:
            message = str(exc)
            retry_signals = (
                "IndexError: index -1 is out of bounds",
                "seek_sequence",
                "generate_with_fallback",
            )
            if used_language and any(signal in message for signal in retry_signals):
                log.info("Retrying with language auto-detection")
                used_language = None
                data = run_cli(used_language)
            else:
                raise

        segments = self._parse_output(data, language)
        detected_language = data.get("language") or (used_language if used_language else "auto")
        model_used = data.get("model") or self.model_name

        return segments, str(detected_language), model_used

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

        detected_language = language
        all_segments: list[TranscriptionSegment] = []

        for track in tracks:
            track_path = Path(track["file_path"])
            if not track_path.exists():
                continue

            label = _speaker_label(speaker_map.get(track["id"]), track["id"])
            segments, detected_language, _ = self._transcribe_file(track_path, language)

            for seg in segments:
                all_segments.append(
                    TranscriptionSegment(
                        text=seg.text,
                        start=seg.start,
                        end=seg.end,
                        speaker=label,
                        source=track["id"],
                        words=seg.words,
                    )
                )

        all_segments.sort(key=lambda s: s.start)
        return TranscriptionResult(
            segments=all_segments,
            language=detected_language,
            provider=self.name,
            metadata={"model": self.model_name},
        )
