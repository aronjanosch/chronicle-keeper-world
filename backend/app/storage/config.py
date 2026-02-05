"""SQLite-backed configuration store."""

from __future__ import annotations

import json
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
    "campaigns_json": str,
    "current_campaign_id": str,
}

CAMPAIGN_FIELDS = {
    "campaign_id",
    "name",
    "next_session_number",
    "system",
    "gm",
    "setting",
    "default_language",
    "players",
}

CAMPAIGN_OPTIONAL_FIELDS = {
    "system": "",
    "gm": "",
    "setting": "",
    "default_language": "",
    "players": [],
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
    "campaigns_json": "[]",
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


def _load_campaigns(config: dict[str, Any]) -> list[dict[str, Any]]:
    raw = config.get("campaigns_json", "[]")
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [_normalize_campaign(item, config) for item in data]
    except json.JSONDecodeError:
        pass
    return []


def get_campaigns() -> list[dict[str, Any]]:
    """Return campaign list stored in config."""
    return _load_campaigns(get_config())


def _normalize_players(players: Any) -> list[str]:
    if not players:
        return []
    if isinstance(players, list):
        raw = players
    elif isinstance(players, str):
        raw = [item.strip() for item in players.split(",")]
    else:
        return []
    cleaned = [str(item).strip() for item in raw if str(item).strip()]
    return list(dict.fromkeys(cleaned))


def _normalize_campaign(campaign: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "campaign_id": campaign.get("campaign_id", ""),
        "name": campaign.get("name", ""),
        "next_session_number": int(campaign.get("next_session_number", 1)),
    }
    for key, default_value in CAMPAIGN_OPTIONAL_FIELDS.items():
        if key == "default_language":
            normalized[key] = campaign.get(key, config.get("default_language", "en"))
        elif key == "players":
            normalized[key] = _normalize_players(campaign.get(key))
        else:
            normalized[key] = campaign.get(key, default_value)
    return normalized


def get_current_campaign_id() -> str | None:
    """Return current campaign ID if set."""
    config = get_config()
    return config.get("current_campaign_id") or None


def set_current_campaign_id(campaign_id: str) -> None:
    """Set the current campaign ID."""
    update_config({"current_campaign_id": campaign_id})


def create_campaign(
    campaign_id: str, name: str, start_session_number: int = 1
) -> dict[str, Any]:
    """Create a new campaign or return existing."""
    config = get_config()
    campaigns = _load_campaigns(config)
    for campaign in campaigns:
        if campaign.get("campaign_id") == campaign_id:
            return campaign

    campaign = {
        "campaign_id": campaign_id,
        "name": name,
        "next_session_number": int(start_session_number),
        "system": "",
        "gm": "",
        "setting": "",
        "default_language": config.get("default_language", "en"),
        "players": [],
    }
    campaigns.append(campaign)
    update_config({"campaigns_json": json.dumps(campaigns)})

    if not config.get("current_campaign_id"):
        set_current_campaign_id(campaign_id)

    return campaign


def get_campaign(campaign_id: str) -> dict[str, Any] | None:
    config = get_config()
    for campaign in _load_campaigns(config):
        if campaign.get("campaign_id") == campaign_id:
            return campaign
    return None


def update_campaign(campaign_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    config = get_config()
    campaigns = _load_campaigns(config)
    for campaign in campaigns:
        if campaign.get("campaign_id") != campaign_id:
            continue
        for key, value in updates.items():
            if key not in CAMPAIGN_FIELDS or value is None:
                continue
            if key == "players":
                campaign[key] = _normalize_players(value)
            elif key == "next_session_number":
                campaign[key] = int(value)
            else:
                campaign[key] = value
        update_config({"campaigns_json": json.dumps(campaigns)})
        return _normalize_campaign(campaign, config)
    raise KeyError(f"Campaign not found: {campaign_id}")


def get_next_session_number(campaign_id: str | None = None) -> int:
    """Return the next session number for a campaign."""
    config = get_config()
    campaigns = _load_campaigns(config)
    target_id = campaign_id or config.get("current_campaign_id")

    for campaign in campaigns:
        if campaign.get("campaign_id") == target_id:
            return int(campaign.get("next_session_number", 1))

    return 1


def increment_session_number(campaign_id: str | None = None) -> int:
    """Increment and return the next session number."""
    config = get_config()
    campaigns = _load_campaigns(config)
    target_id = campaign_id or config.get("current_campaign_id")

    for campaign in campaigns:
        if campaign.get("campaign_id") == target_id:
            campaign["next_session_number"] = int(
                campaign.get("next_session_number", 1)
            ) + 1
            update_config({"campaigns_json": json.dumps(campaigns)})
            return campaign["next_session_number"]

    return 1
