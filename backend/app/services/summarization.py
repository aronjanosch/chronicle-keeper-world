"""Summarization service for session transcripts."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

import requests
from google import genai

from app.prompts import build_metadata_prompt, build_summary_prompt
from app.services.sessions import get_session_path, load_session, save_session
from app.storage.config import get_summarization_config


class SummarizationError(Exception):
    """Raised when summarization fails."""


@dataclass(frozen=True)
class SummarizeResult:
    summary: str
    provider: str
    model: str
    summary_path: str | None
    metadata: dict[str, Any] | None


def _call_ollama(prompt: str, *, model: str, base_url: str, timeout: int) -> str:
    response = requests.post(
        f"{base_url.rstrip('/')}/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    return (payload.get("response") or "").strip()


def _call_gemini(prompt: str, *, api_key: str, model: str) -> str:
    if not api_key:
        raise SummarizationError("Gemini API key is required.")
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model, contents=prompt)
    return (response.text or "").strip()


def _parse_metadata(raw_text: str) -> dict[str, Any] | None:
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        return None


def summarize_session(
    session_id: str,
    transcript_path: str | None = None,
    output_path: str | None = None,
    title: str | None = None,
    context: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> SummarizeResult:
    """Summarize a session transcript and persist results."""
    session = load_session(session_id)
    config = get_summarization_config()

    transcript_path = transcript_path or session.get("transcription", {}).get("text_path")
    if not transcript_path:
        raise FileNotFoundError("Transcript not found for session.")

    transcript_text = Path(transcript_path).read_text(encoding="utf-8")
    language = config.default_language

    summary_prompt = build_summary_prompt(
        transcript_text, title=title, context=context, language=language
    )

    provider = (provider or config.summary_provider).lower()
    if provider == "ollama":
        model_name = model or config.ollama_model
        base_url = base_url or config.ollama_base_url
        summary_text = _call_ollama(
            summary_prompt,
            model=model_name,
            base_url=base_url,
            timeout=config.ollama_timeout_seconds,
        )
        metadata_text = _call_ollama(
            build_metadata_prompt(summary_text, language=language),
            model=model_name,
            base_url=base_url,
            timeout=config.ollama_timeout_seconds,
        )
    elif provider == "gemini":
        model_name = model or config.gemini_model
        summary_text = _call_gemini(summary_prompt, api_key=config.gemini_api_key, model=model_name)
        metadata_text = _call_gemini(
            build_metadata_prompt(summary_text, language=language),
            api_key=config.gemini_api_key,
            model=model_name,
        )
    else:
        raise SummarizationError(f"Unknown provider: {provider}")

    metadata = _parse_metadata(metadata_text)

    session_path = get_session_path(session_id)
    if output_path:
        summary_path = Path(output_path)
    else:
        summary_dir = session_path / "summaries"
        summary_dir.mkdir(parents=True, exist_ok=True)
        summary_path = summary_dir / "summary.md"

    summary_path.write_text(summary_text, encoding="utf-8")

    session["summary"] = {
        "summary_path": str(summary_path),
        "provider": provider,
        "model": model_name,
    }
    session["metadata"] = metadata or {}
    save_session(session_id, session)

    return SummarizeResult(
        summary=summary_text,
        provider=provider,
        model=model_name,
        summary_path=str(summary_path),
        metadata=metadata,
    )
