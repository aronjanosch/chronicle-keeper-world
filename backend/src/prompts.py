"""
Centralized prompt management for Chronicle Keeper.

This module contains all LLM prompts and metadata definitions.
Uses a two-call approach: (1) generate summary, (2) extract metadata.
"""

from typing import Dict

# ============================================================================
# SUMMARY GENERATION PROMPTS (Two-call approach)
# ============================================================================

# These prompts are used for Call 1: Generate the session summary
# Call 2 uses metadata extraction prompts (see METADATA section below)

BASE_PROMPTS: Dict[str, str] = {
    "en": """You are an RPG assistant for the GM. Create a clean, chronological session summary.

CHARACTER NAMES: Always use CHARACTER NAMES from the transcript (not player names). Use correct pronouns.

FOCUS: Story continuity, not mechanics. NO damage numbers, NO stats, NO ability names, NO Hope/resource tracking.

STRUCTURE: Follow this Markdown structure:

## What Happened

[Write 3-5 paragraphs telling the story of the session chronologically from start to finish. Focus on the narrative flow - what happened, in what order, and how it ended. Make it readable and cohesive, not fragmented.]

## Remember for Next Time

**Key Events:**
- [3-5 bullet points of major story moments that matter for continuity]

**Important NPCs:**
- [Name]: [One sentence about their current status and why they matter]
- [Name]: [One sentence about their current status and why they matter]

**Decisions & Consequences:**
- [Major choices the party made and what they mean going forward]

**Major Items Gained:**
- [Only list significant items - no common loot, no materials, no trivial resources]

**Unresolved:**
- [Story threads and mysteries that need follow-up]""",

    "de": """Du bist ein RPG-Assistent für den Spielleiter. Erstelle eine klare, chronologische Sitzungszusammenfassung.

CHARAKTERNAMEN: Verwende immer den CHARAKTERNAMEN aus dem Transkript (nicht Spielername). Nutze die korrekten Pronomen.

FOKUS: Story-Kontinuität, keine Mechaniken. KEIN Schaden, KEINE Stats, KEINE Fähigkeitsnamen, KEIN Hope/Ressourcen-Tracking.

STRUKTUR: Folge dieser Markdown-Struktur:

## Was geschah

[Schreibe 3-5 Absätze, die die Geschichte der Sitzung chronologisch von Anfang bis Ende erzählen. Fokus auf den narrativen Fluss - was geschah, in welcher Reihenfolge, und wie es endete. Mach es lesbar und zusammenhängend, nicht fragmentiert.]

## Wichtig für nächstes Mal

**Schlüsselereignisse:**
- [3-5 Stichpunkte zu wichtigen Story-Momenten, die für Kontinuität wichtig sind]

**Wichtige NPCs:**
- [Name]: [Ein Satz über ihren aktuellen Status und warum sie wichtig sind]
- [Name]: [Ein Satz über ihren aktuellen Status und warum sie wichtig sind]

**Entscheidungen & Konsequenzen:**
- [Wichtige Entscheidungen der Gruppe und was sie für die Zukunft bedeuten]

**Wichtige erhaltene Gegenstände:**
- [Nur bedeutende Items auflisten - keine gewöhnliche Beute, keine Materialien, keine trivialen Ressourcen]

**Ungeklärt:**
- [Story-Fäden und Mysterien, die Follow-up brauchen]"""
}

# ============================================================================
# METADATA STRUCTURE & GUIDELINES
# ============================================================================

METADATA_JSON_STRUCTURE = {
    "suggested_tags": [],
    "mentioned_characters": [],
    "mentioned_locations": [],
    "session_tone": [],
    "key_events": []
}

METADATA_GUIDELINES: Dict[str, str] = {
    "en": """Metadata guidelines:
- suggested_tags: REQUIRED. List 3-5 tags. E.g., "Combat", "Social", "Exploration", "Mystery".
- mentioned_characters: List important PCs and NPCs. Use specific names.
- mentioned_locations: List specific locations visited or mentioned.
- session_tone: REQUIRED. List 1-3 mood descriptors. E.g., "Tense", "Humorous", "Dark".
- key_events: REQUIRED. List 3-5 short bullet points of major events.

Ensure ALL required fields are populated. Do not return empty lists for tags, tone, or events.""",
    "de": """Metadaten-Richtlinien:
- suggested_tags: ERFORDERLICH. Liste 3-5 Tags. Z.B. "Kampf", "Sozial", "Erkundung", "Mysterium".
- mentioned_characters: Liste wichtige SCs und NPCs. Verwende spezifische Namen.
- mentioned_locations: Liste spezifische besuchte oder erwähnte Orte.
- session_tone: ERFORDERLICH. Liste 1-3 Stimmungsbeschreibungen. Z.B. "Angespannt", "Humorvoll", "Düster".
- key_events: ERFORDERLICH. Liste 3-5 kurze Stichpunkte zu Hauptereignissen.

Stelle sicher, dass ALLE erforderlichen Felder ausgefüllt sind. Gib KEINE leeren Listen für Tags, Stimmung oder Ereignisse zurück."""
}

def get_metadata_guidelines(language: str = "en") -> str:
    """Get metadata guidelines in the specified language."""
    return METADATA_GUIDELINES.get(language, METADATA_GUIDELINES["en"])

# ============================================================================
# STRUCTURED OUTPUT INSTRUCTIONS (for metadata extraction)
# ============================================================================

STRUCTURED_OUTPUT_INSTRUCTIONS: Dict[str, str] = {
    "en": "Analyze the transcript and generate a structured summary. You MUST populate the metadata lists. 'suggested_tags', 'session_tone', and 'key_events' CANNOT be empty. If you are unsure, infer the best options from the context.",
    "de": "Analysiere das Transkript und erstelle eine strukturierte Zusammenfassung. Du MUSST die Metadaten-Listen füllen. 'suggested_tags', 'session_tone' und 'key_events' DÜRFEN NICHT leer sein. Wenn du unsicher bist, leite die besten Optionen aus dem Kontext ab."
}

TRANSCRIPT_LABELS: Dict[str, str] = {
    "en": "Transcript:",
    "de": "Transkript:"
}

# ============================================================================
# PROMPT BUILDER FUNCTIONS
# ============================================================================

def get_base_prompt(language: str = "en") -> str:
    """
    Get the base system prompt for the specified language.

    Args:
        language: Language code (en, de)

    Returns:
        Base system prompt string
    """
    return BASE_PROMPTS.get(language, BASE_PROMPTS["en"])


def get_available_languages() -> Dict[str, str]:
    """
    Get available languages with their display names.

    Returns:
        Dictionary mapping language codes to display names
    """
    return {
        "en": "English",
        "de": "Deutsch"
    }


def build_structured_prompt(base_prompt: str, transcript: str, language: str = "en") -> str:
    """
    Build a prompt specifically for native structured output (JSON schema).
    
    This avoids conflicting formatting instructions (like separators) that confuse
    models when JSON schema enforcement is active.

    Args:
        base_prompt: The base system prompt
        transcript: The session transcript to analyze
        language: Language code (en, de)

    Returns:
        Prompt string optimized for structured output
    """
    transcript_label = TRANSCRIPT_LABELS.get(language, TRANSCRIPT_LABELS["en"])
    instructions = STRUCTURED_OUTPUT_INSTRUCTIONS.get(language, STRUCTURED_OUTPUT_INSTRUCTIONS["en"])
    metadata_guidelines = get_metadata_guidelines(language)
    
    return f"""{base_prompt}

{instructions}

{metadata_guidelines}

{transcript_label}
{transcript}"""


def build_simple_prompt(base_prompt: str, transcript: str, language: str = "en") -> str:
    """
    Build a simple prompt without metadata extraction.

    Args:
        base_prompt: The base system prompt
        transcript: The session transcript to analyze
        language: Language code (en, de)

    Returns:
        Simple prompt string
    """
    transcript_label = TRANSCRIPT_LABELS.get(language, TRANSCRIPT_LABELS["en"])
    return f"""{base_prompt}

{transcript_label}
{transcript}"""


METADATA_ANALYSIS_PROMPTS: Dict[str, str] = {
    "en": """Analyze this TTRPG transcript and extract metadata. Return ONLY valid JSON with this exact structure:""",
    "de": """Analysiere dieses TTRPG-Transkript und extrahiere Metadaten. Gib NUR gültiges JSON mit dieser exakten Struktur zurück:"""
}

JSON_RESPONSE_LABELS: Dict[str, str] = {
    "en": "JSON Response:",
    "de": "JSON-Antwort:"
}

def get_metadata_analysis_prompt(transcript: str, language: str = "en") -> str:
    """
    Build a prompt specifically for metadata extraction.

    Args:
        transcript: The session transcript to analyze
        language: Language code (en, de)

    Returns:
        Metadata analysis prompt
    """
    import json

    prompt_text = METADATA_ANALYSIS_PROMPTS.get(language, METADATA_ANALYSIS_PROMPTS["en"])
    transcript_label = TRANSCRIPT_LABELS.get(language, TRANSCRIPT_LABELS["en"])
    json_label = JSON_RESPONSE_LABELS.get(language, JSON_RESPONSE_LABELS["en"])
    metadata_guidelines = get_metadata_guidelines(language)

    return f"""{prompt_text}

{json.dumps(METADATA_JSON_STRUCTURE, indent=4)}

{metadata_guidelines}

{transcript_label}
{transcript}

{json_label}"""
