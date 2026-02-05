"""
Pydantic models for structured LLM outputs.

These models define the exact structure that both Ollama and Gemini
will return, ensuring type safety and eliminating manual parsing.
"""

from pydantic import BaseModel, Field
from typing import List


class SessionMetadata(BaseModel):
    """
    Metadata extracted from a TTRPG session transcript.

    All fields are lists limited to 5-8 most relevant items.
    """
    suggested_tags: List[str] = Field(
        description="Array of 3-5 tags categorizing the session content. Choose from: Combat, Social, Exploration, Mystery, Puzzle, Roleplay, Investigation, Stealth, Magic, Travel, Shopping, Planning, Negotiation, or create similar specific tags. Example: ['Combat', 'Mystery', 'Social']",
        min_length=3,
        max_length=5
    )
    mentioned_characters: List[str] = Field(
        description="Array of character names (both PCs and NPCs) that appeared or were mentioned. Use specific names from the transcript. Example: ['Elaria', 'GM']",
        default_factory=list
    )
    mentioned_locations: List[str] = Field(
        description="Array of specific location names visited or discussed. Example: ['Telodar', 'Forest Outpost']",
        default_factory=list
    )
    session_tone: List[str] = Field(
        description="Array of 1-3 adjectives describing the overall session atmosphere. Choose from: Tense, Humorous, Dark, Epic, Lighthearted, Dramatic, Mysterious, Action-Packed, Emotional, Casual. Example: ['Tense', 'Action-Packed']",
        min_length=1,
        max_length=3
    )
    key_events: List[str] = Field(
        description="Array of 3-5 brief descriptions of major events that occurred. Each should be a short phrase or sentence. Example: ['Defeated enemy scout', 'Gathered reinforcements', 'Planned assault on enemy camp']",
        min_length=3,
        max_length=5
    )


class SummaryResponse(BaseModel):
    """
    Complete response structure for session summarization.

    Contains both the markdown-formatted summary and extracted metadata.
    """
    summary: str = Field(
        description="Markdown formatted session summary with two sections: 'Summary of Events' and 'Key Decisions & Next Steps'"
    )
    metadata: SessionMetadata = Field(
        description="Extracted metadata including tags, characters, locations, tone, and key events"
    )


def get_empty_metadata() -> dict:
    """
    Get an empty metadata structure with all expected keys.

    Returns:
        Dictionary with empty lists for all metadata fields
    """
    return {
        "suggested_tags": [],
        "mentioned_characters": [],
        "mentioned_locations": [],
        "session_tone": [],
        "key_events": []
    }
