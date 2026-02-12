"""Transcription provider registry."""

from __future__ import annotations

from app.services.transcription.insanely_fast_whisper_provider import (
    InsanelyFastWhisperProvider,
)
from app.services.transcription.mlx_audio_provider import MLXAudioProvider
from app.services.transcription.whisperx_provider import WhisperXProvider

PROVIDERS = {
    "mlx-audio": {
        "factory": MLXAudioProvider,
        "display_name": "MLX Audio",
        "description": "Apple Silicon optimized - multiple STT models via mlx-audio",
        "supports_diarization": False,
        "default_model": "mlx-community/whisper-large-v3-turbo-asr-fp16",
        "models": [
            {
                "id": "mlx-community/whisper-large-v3-turbo-asr-fp16",
                "name": "Whisper Large v3 Turbo",
                "description": "Fast and accurate, 99+ languages (recommended)",
            },
            {
                "id": "mlx-community/whisper-large-v3-asr-fp16",
                "name": "Whisper Large v3",
                "description": "Best Whisper accuracy, 99+ languages",
            },
            {
                "id": "mlx-community/parakeet-tdt-0.6b-v3",
                "name": "Parakeet TDT 0.6B v3",
                "description": "NVIDIA's accurate STT, 25 EU languages",
            },
            {
                "id": "mlx-community/parakeet-tdt-0.6b-v2",
                "name": "Parakeet TDT 0.6B v2",
                "description": "NVIDIA's accurate STT, English only",
            },
            {
                "id": "mlx-community/Qwen3-ASR-1.7B-8bit",
                "name": "Qwen3-ASR 1.7B (8-bit)",
                "description": "Alibaba's multilingual ASR",
            },
            {
                "id": "mlx-community/Qwen3-ASR-0.6B-8bit",
                "name": "Qwen3-ASR 0.6B (8-bit)",
                "description": "Alibaba's smaller multilingual ASR",
            },
            {
                "id": "mlx-community/VibeVoice-ASR-bf16",
                "name": "VibeVoice-ASR 9B",
                "description": "Microsoft's 9B model with built-in diarization",
            },
        ],
    },
    "whisperx": {
        "factory": WhisperXProvider,
        "display_name": "WhisperX",
        "description": "WhisperX transcription with alignment",
        "supports_diarization": False,
        "default_model": "large-v2",
        "models": [
            {
                "id": "large-v3",
                "name": "Whisper Large v3",
                "description": "Latest, highest accuracy",
            },
            {
                "id": "large-v3-turbo",
                "name": "Whisper Large v3 Turbo",
                "description": "Fast, near-equal accuracy to v3",
            },
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
    },
    "insanely-fast-whisper": {
        "factory": InsanelyFastWhisperProvider,
        "display_name": "Insanely Fast Whisper",
        "description": "Fast Whisper transcription via CLI (no diarization)",
        "supports_diarization": False,
        "default_model": "openai/whisper-large-v3",
        "models": [
            {
                "id": "openai/whisper-large-v3",
                "name": "Whisper Large v3",
                "description": "High accuracy (default)",
            },
            {
                "id": "openai/whisper-large-v3-turbo",
                "name": "Whisper Large v3 Turbo",
                "description": "Faster, near-equal accuracy",
            },
            {
                "id": "distil-whisper/distil-large-v3",
                "name": "Distil Large v3",
                "description": "Distilled, fastest",
            },
        ],
    },
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
