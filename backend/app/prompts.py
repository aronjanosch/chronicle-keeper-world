"""Prompt templates for Chronicle Keeper summaries."""

from __future__ import annotations

SUMMARY_TEMPLATES = {
    "en": (
        "You are a helpful assistant that summarizes D&D session transcripts.\n"
        "Write in English. Keep it concise, structured, and easy to read.\n"
    ),
    "de": (
        "Du bist ein hilfreicher Assistent, der D&D-Sitzungen zusammenfasst.\n"
        "Schreibe auf Deutsch. Halte es kurz, strukturiert und gut lesbar.\n"
    ),
}

METADATA_TEMPLATES = {
    "en": (
        "Extract session metadata as JSON with keys: "
        "characters, locations, events, items, tags.\n"
        "Use arrays of strings. If unknown, return empty arrays.\n"
    ),
    "de": (
        "Extrahiere Sitzungs-Metadaten als JSON mit Schluesseln: "
        "characters, locations, events, items, tags.\n"
        "Verwende Arrays aus Strings. Falls unbekannt, gib leere Arrays zurueck.\n"
    ),
}


def _template_for(language: str, templates: dict[str, str]) -> str:
    return templates.get(language, templates["en"])


def build_summary_prompt(
    transcript: str,
    *,
    title: str | None = None,
    context: str | None = None,
    language: str = "en",
) -> str:
    """Build a concise session summary prompt."""
    title_line = f"Title: {title}\n" if title else ""
    context_line = f"Context: {context}\n" if context else ""
    header = _template_for(language, SUMMARY_TEMPLATES)

    return (
        f"{header}"
        f"{title_line}{context_line}\n"
        f"Transcript:\n{transcript}\n"
        "Return only the summary in markdown."
    )


def build_metadata_prompt(summary: str, *, language: str = "en") -> str:
    """Build a prompt to extract simple metadata from a summary."""
    header = _template_for(language, METADATA_TEMPLATES)
    return (
        f"{header}"
        f"Summary:\n{summary}\n"
        "Return only valid JSON."
    )
