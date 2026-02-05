"""Transcription provider registry."""

from __future__ import annotations

from app.services.transcription.whisperx_provider import WhisperXProvider

PROVIDERS = {
    "whisperx": {
        "factory": WhisperXProvider,
        "display_name": "WhisperX",
        "description": "WhisperX transcription with alignment",
        "supports_diarization": False,
        "default_model": "large-v2",
        "models": [
            {
                "id": "large-v2",
                "name": "Whisper Large v2",
                "description": "High accuracy, slower",
            },
            {
                "id": "medium",
                "name": "Whisper Medium",
                "description": "Balanced speed/quality",
            },
            {
                "id": "small",
                "name": "Whisper Small",
                "description": "Faster, lower accuracy",
            },
        ],
    }
}


def get_provider(name: str, **kwargs):
    provider = PROVIDERS.get(name)
    if not provider:
        raise ValueError(f"Unknown provider: {name}")
    return provider["factory"](**kwargs)


def get_available_providers() -> list[dict]:
    return [
        {
            "name": name,
            "display_name": info["display_name"],
            "description": info["description"],
            "supports_diarization": info["supports_diarization"],
            "default_model": info["default_model"],
            "models": info["models"],
        }
        for name, info in PROVIDERS.items()
    ]
