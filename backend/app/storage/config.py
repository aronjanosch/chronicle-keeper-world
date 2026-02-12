"""SQLite-backed configuration store."""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.storage.db import get_connection

CONFIG_TYPES: dict[str, Callable[[str], Any]] = {
    "output_root": str,
    "summary_provider": str,
    "ollama_base_url": str,
    "ollama_model": str,
    "ollama_timeout_seconds": int,
    "gemini_api_key": str,
    "gemini_model": str,
    "default_language": str,
    "whisperx_model": str,
    "hf_token": str,
    "current_campaign_id": str,
}

DEFAULT_CONFIG: dict[str, str] = {
    "output_root": os.getenv(
        "CK_OUTPUT_ROOT",
        str(Path.home() / "Documents" / "chronicle-keeper"),
    ),
    "summary_provider": os.getenv("CK_SUMMARY_PROVIDER", "ollama"),
    "ollama_base_url": os.getenv("CK_OLLAMA_BASE_URL", "http://localhost:11434"),
    "ollama_model": os.getenv("CK_OLLAMA_MODEL", "llama3.2:latest"),
    "ollama_timeout_seconds": os.getenv("CK_OLLAMA_TIMEOUT", "120"),
    "gemini_api_key": os.getenv("CK_GEMINI_API_KEY", ""),
    "gemini_model": os.getenv("CK_GEMINI_MODEL", "gemini-2.5-flash"),
    "default_language": os.getenv("CK_DEFAULT_LANGUAGE", "en"),
    "whisperx_model": os.getenv("CK_WHISPERX_MODEL", "large-v2"),
    "hf_token": os.getenv("CK_HF_TOKEN", ""),
    "current_campaign_id": "",
}


@dataclass(frozen=True)
class SummarizationConfig:
    """Runtime configuration for summarization providers."""

    summary_provider: str
    ollama_base_url: str
    ollama_model: str
    ollama_timeout_seconds: int
    gemini_api_key: str
    gemini_model: str
    default_language: str


@dataclass(frozen=True)
class TranscriptionConfig:
    """Runtime configuration for transcription providers."""

    whisperx_model: str
    hf_token: str


def _ensure_defaults(connection: sqlite3.Connection) -> None:
    existing = {
        row["key"] for row in connection.execute("SELECT key FROM config").fetchall()
    }
    for key, value in DEFAULT_CONFIG.items():
        if key not in existing:
            connection.execute(
                "INSERT INTO config (key, value) VALUES (?, ?)",
                (key, value),
            )
    connection.commit()


def _normalize_value(key: str, value: Any) -> str:
    if value is None:
        raise ValueError(f"Config value for '{key}' cannot be None.")
    if key not in CONFIG_TYPES:
        raise ValueError(f"Unknown config key: {key}")
    return str(value)


def get_config() -> dict[str, Any]:
    """Return the full configuration with typed values."""
    with get_connection() as connection:
        _ensure_defaults(connection)
        rows = connection.execute("SELECT key, value FROM config").fetchall()

    config: dict[str, Any] = {}
    for row in rows:
        key = row["key"]
        converter = CONFIG_TYPES.get(key, str)
        if key in CONFIG_TYPES:
            config[key] = converter(row["value"])

    for key, default in DEFAULT_CONFIG.items():
        if key not in config:
            config[key] = CONFIG_TYPES[key](default)

    return config


def get_summarization_config() -> SummarizationConfig:
    """Return typed summarization configuration."""
    config = get_config()
    return SummarizationConfig(
        summary_provider=config["summary_provider"],
        ollama_base_url=config["ollama_base_url"],
        ollama_model=config["ollama_model"],
        ollama_timeout_seconds=config["ollama_timeout_seconds"],
        gemini_api_key=config["gemini_api_key"],
        gemini_model=config["gemini_model"],
        default_language=config["default_language"],
    )


def get_transcription_config() -> TranscriptionConfig:
    """Return typed transcription configuration."""
    config = get_config()
    return TranscriptionConfig(
        whisperx_model=config["whisperx_model"],
        hf_token=config["hf_token"],
    )


def update_config(updates: dict[str, Any]) -> dict[str, Any]:
    """Update configuration values and return the full updated config."""
    if not updates:
        return get_config()

    filtered_updates = {
        key: _normalize_value(key, value)
        for key, value in updates.items()
        if value is not None
    }
    if not filtered_updates:
        return get_config()

    with get_connection() as connection:
        for key, value in filtered_updates.items():
            connection.execute(
                "INSERT INTO config (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
        connection.commit()

    return get_config()


def get_current_campaign_id() -> str | None:
    """Return current campaign ID if set."""
    config = get_config()
    return config.get("current_campaign_id") or None


def set_current_campaign_id(campaign_id: str) -> None:
    """Set the current campaign ID."""
    update_config({"current_campaign_id": campaign_id})
