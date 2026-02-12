"""Prompt templates for Chronicle Keeper summaries.

Provides rich default system prompts in multiple languages, based on
the original Chronicle Keeper prompt system.  Users can select a preset
or supply a fully custom prompt via the API.
"""

from __future__ import annotations

import json
from typing import Any

# ============================================================================
# SUMMARY SYSTEM PROMPTS (presets)
# ============================================================================

SUMMARY_PROMPTS: dict[str, dict[str, str]] = {
    "en": {
        "label": "English – D&D / TTRPG",
        "text": (
            "You are an RPG assistant for the GM. Create a clean, chronological session summary.\n"
            "\n"
            "CHARACTER NAMES: Always use CHARACTER NAMES from the transcript (not player names). "
            "Use correct pronouns.\n"
            "\n"
            "FOCUS: Story continuity, not mechanics. NO damage numbers, NO stats, NO ability names, "
            "NO Hope/resource tracking.\n"
            "\n"
            "STRUCTURE: Follow this Markdown structure:\n"
            "\n"
            "## What Happened\n"
            "\n"
            "[Write 3-5 paragraphs telling the story of the session chronologically from start to "
            "finish. Focus on the narrative flow - what happened, in what order, and how it ended. "
            "Make it readable and cohesive, not fragmented.]\n"
            "\n"
            "## Remember for Next Time\n"
            "\n"
            "**Key Events:**\n"
            "- [3-5 bullet points of major story moments that matter for continuity]\n"
            "\n"
            "**Important NPCs:**\n"
            "- [Name]: [One sentence about their current status and why they matter]\n"
            "- [Name]: [One sentence about their current status and why they matter]\n"
            "\n"
            "**Decisions & Consequences:**\n"
            "- [Major choices the party made and what they mean going forward]\n"
            "\n"
            "**Major Items Gained:**\n"
            "- [Only list significant items - no common loot, no materials, no trivial resources]\n"
            "\n"
            "**Unresolved:**\n"
            "- [Story threads and mysteries that need follow-up]"
        ),
    },
    "de": {
        "label": "Deutsch – D&D / TTRPG",
        "text": (
            "Du bist ein RPG-Assistent für den Spielleiter. Erstelle eine klare, chronologische "
            "Sitzungszusammenfassung.\n"
            "\n"
            "CHARAKTERNAMEN: Verwende immer den CHARAKTERNAMEN aus dem Transkript (nicht "
            "Spielername). Nutze die korrekten Pronomen.\n"
            "\n"
            "FOKUS: Story-Kontinuität, keine Mechaniken. KEIN Schaden, KEINE Stats, KEINE "
            "Fähigkeitsnamen, KEIN Hope/Ressourcen-Tracking.\n"
            "\n"
            "STRUKTUR: Folge dieser Markdown-Struktur:\n"
            "\n"
            "## Was geschah\n"
            "\n"
            "[Schreibe 3-5 Absätze, die die Geschichte der Sitzung chronologisch von Anfang bis "
            "Ende erzählen. Fokus auf den narrativen Fluss - was geschah, in welcher Reihenfolge, "
            "und wie es endete. Mach es lesbar und zusammenhängend, nicht fragmentiert.]\n"
            "\n"
            "## Wichtig für nächstes Mal\n"
            "\n"
            "**Schlüsselereignisse:**\n"
            "- [3-5 Stichpunkte zu wichtigen Story-Momenten, die für Kontinuität wichtig sind]\n"
            "\n"
            "**Wichtige NPCs:**\n"
            "- [Name]: [Ein Satz über ihren aktuellen Status und warum sie wichtig sind]\n"
            "- [Name]: [Ein Satz über ihren aktuellen Status und warum sie wichtig sind]\n"
            "\n"
            "**Entscheidungen & Konsequenzen:**\n"
            "- [Wichtige Entscheidungen der Gruppe und was sie für die Zukunft bedeuten]\n"
            "\n"
            "**Wichtige erhaltene Gegenstände:**\n"
            "- [Nur bedeutende Items auflisten - keine gewöhnliche Beute, keine Materialien, "
            "keine trivialen Ressourcen]\n"
            "\n"
            "**Ungeklärt:**\n"
            "- [Story-Fäden und Mysterien, die Follow-up brauchen]"
        ),
    },
}

# ============================================================================
# METADATA EXTRACTION PROMPTS
# ============================================================================

METADATA_JSON_STRUCTURE: dict[str, list[Any]] = {
    "characters": [],
    "locations": [],
    "events": [],
    "items": [],
    "tags": [],
}

METADATA_GUIDELINES: dict[str, str] = {
    "en": (
        "Metadata guidelines:\n"
        "- characters: List important PCs and NPCs mentioned. Use specific names.\n"
        "- locations: List specific locations visited or mentioned.\n"
        "- events: List 3-5 short bullet points of major events.\n"
        "- items: List significant items gained or mentioned.\n"
        "- tags: List 3-5 tags. E.g., \"Combat\", \"Social\", \"Exploration\", \"Mystery\".\n"
        "\n"
        "Ensure ALL fields are populated. Do not return empty lists."
    ),
    "de": (
        "Metadaten-Richtlinien:\n"
        "- characters: Liste wichtige SCs und NPCs. Verwende spezifische Namen.\n"
        "- locations: Liste spezifische besuchte oder erwähnte Orte.\n"
        "- events: Liste 3-5 kurze Stichpunkte zu Hauptereignissen.\n"
        "- items: Liste bedeutende erhaltene oder erwähnte Gegenstände.\n"
        "- tags: Liste 3-5 Tags. Z.B. \"Kampf\", \"Sozial\", \"Erkundung\", \"Mysterium\".\n"
        "\n"
        "Stelle sicher, dass ALLE Felder ausgefüllt sind. Gib KEINE leeren Listen zurück."
    ),
}

METADATA_ANALYSIS_PROMPTS: dict[str, str] = {
    "en": "Analyze this TTRPG session summary and extract metadata. Return ONLY valid JSON with this exact structure:",
    "de": "Analysiere diese TTRPG-Sitzungszusammenfassung und extrahiere Metadaten. Gib NUR gültiges JSON mit dieser exakten Struktur zurück:",
}

TRANSCRIPT_LABELS: dict[str, str] = {
    "en": "Transcript:",
    "de": "Transkript:",
}

SESSION_CONTEXT_LABELS: dict[str, str] = {
    "en": "Session Context:",
    "de": "Sitzungskontext:",
}

SPEAKERS_LABELS: dict[str, str] = {
    "en": "Speakers:",
    "de": "Sprecher:",
}

GM_LABELS: dict[str, str] = {
    "en": "is the GM",
    "de": "ist der Spielleiter",
}

PLAYS_LABELS: dict[str, str] = {
    "en": "plays",
    "de": "spielt",
}


# ============================================================================
# HELPER
# ============================================================================

def _lang(language: str, mapping: dict[str, str]) -> str:
    return mapping.get(language, mapping["en"])


# ============================================================================
# PUBLIC API
# ============================================================================

def get_available_prompts() -> dict[str, dict[str, str]]:
    """Return all available prompt presets.

    Returns ``{lang_code: {"label": ..., "text": ...}, ...}``.
    """
    return SUMMARY_PROMPTS


def get_prompt_text(language: str) -> str:
    """Get the default summary prompt for *language* (falls back to ``en``)."""
    preset = SUMMARY_PROMPTS.get(language, SUMMARY_PROMPTS["en"])
    return preset["text"]


def build_session_context(
    session_context: dict[str, Any] | None,
    *,
    language: str = "en",
) -> str:
    """Format session & campaign metadata into a context block for the prompt.

    Only includes fields that have non-empty values.
    """
    if not session_context:
        return ""

    lines: list[str] = []

    # Campaign / session fields
    field_labels = {
        "campaign_name": "Campaign",
        "system": "System",
        "setting": "Setting",
        "session_number": "Session Number",
        "title": "Session Title",
        "date": "Date",
        "gm": "GM",
        "extra_info": "Additional Info",
    }
    for key, label in field_labels.items():
        value = session_context.get(key)
        if value:
            lines.append(f"- {label}: {value}")

    context_header = _lang(language, SESSION_CONTEXT_LABELS)
    context_block = ""
    if lines:
        context_block = context_header + "\n" + "\n".join(lines) + "\n"

    # Speakers
    speakers = session_context.get("speakers") or []
    if speakers:
        speakers_label = _lang(language, SPEAKERS_LABELS)
        plays = _lang(language, PLAYS_LABELS)
        gm_label = _lang(language, GM_LABELS)
        gm_name = (session_context.get("gm") or "").strip()
        speaker_lines: list[str] = [speakers_label]
        for s in speakers:
            player = (s.get("player_name") or "").strip()
            character = (s.get("character_name") or "").strip()
            pronouns = (s.get("pronouns") or "").strip()
            if not player and not character:
                continue
            # If this speaker is the GM, label them as such
            if gm_name and player.lower() == gm_name.lower():
                parts = [f"- {player} {gm_label}"]
            elif player and character:
                parts = [f"- {player} {plays} {character}"]
            elif player:
                parts = [f"- {player}"]
            else:
                parts = [f"- {character}"]
            if pronouns:
                parts.append(f"({pronouns})")
            speaker_lines.append(" ".join(parts))
        if len(speaker_lines) > 1:
            context_block += "\n" + "\n".join(speaker_lines) + "\n"

    return context_block


def build_summary_prompt(
    transcript: str,
    *,
    title: str | None = None,
    context: str | None = None,
    language: str = "en",
    system_prompt: str | None = None,
    session_context: dict[str, Any] | None = None,
) -> str:
    """Build the full prompt sent to the LLM for summary generation.

    If *system_prompt* is provided it replaces the built-in template.
    If *session_context* is provided it is inserted between the header
    and the transcript as structured metadata.
    """
    header = system_prompt if system_prompt else get_prompt_text(language)
    title_line = f"Title: {title}\n" if title else ""
    context_line = f"Context: {context}\n" if context else ""
    session_block = build_session_context(session_context, language=language)
    transcript_label = _lang(language, TRANSCRIPT_LABELS)

    return (
        f"{header}\n\n"
        f"{title_line}{context_line}"
        f"{session_block}\n"
        f"{transcript_label}\n{transcript}\n\n"
        "Return only the summary in markdown."
    )


def build_metadata_prompt(summary: str, *, language: str = "en") -> str:
    """Build a prompt to extract structured metadata from a summary."""
    analysis_prompt = _lang(language, METADATA_ANALYSIS_PROMPTS)
    guidelines = _lang(language, METADATA_GUIDELINES)

    return (
        f"{analysis_prompt}\n\n"
        f"{json.dumps(METADATA_JSON_STRUCTURE, indent=2)}\n\n"
        f"{guidelines}\n\n"
        f"Summary:\n{summary}\n\n"
        "Return only valid JSON."
    )
