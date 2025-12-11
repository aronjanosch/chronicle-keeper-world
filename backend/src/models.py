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
        default_factory=list,
        description="Activity types (combat, social, exploration, investigation, puzzle, travel) and tone (dramatic, comedic, tense, mystery, political)",
        max_length=8
    )
    mentioned_characters: List[str] = Field(
        default_factory=list,
        description="Names of NPCs, characters, or entities mentioned multiple times",
        max_length=8
    )
    mentioned_locations: List[str] = Field(
        default_factory=list,
        description="Place names mentioned in the session",
        max_length=8
    )
    session_tone: List[str] = Field(
        default_factory=list,
        description="Overall mood/tone descriptors",
        max_length=8
    )
    key_events: List[str] = Field(
        default_factory=list,
        description="Major story beats or important occurrences",
        max_length=8
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
