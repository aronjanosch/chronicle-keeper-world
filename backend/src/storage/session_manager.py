"""
Session manager for Chronicle Keeper.

Handles session data storage, speaker mappings, and Obsidian export formatting.
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class SessionManager:
    def __init__(self, session_dir: str = None):
        """
        Initialize session manager

        Args:
            session_dir: Directory to store session data (defaults to bundled-safe location)
        """
        if session_dir is None:
            if getattr(sys, 'frozen', False):
                # Running as bundled executable
                session_dir = Path.home() / ".chronicle-keeper" / "temp" / "chronicle_sessions"
            else:
                # Running in development
                session_dir = "/tmp/chronicle_sessions"

        self.session_dir = Path(session_dir)
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.sessions = {}  # In-memory session cache

    def create_session(self, session_id: str, tracks: list, session_metadata: Dict[str, Any] = None):
        """
        Create a new session

        Args:
            session_id: Unique session identifier
            tracks: List of track information
            session_metadata: Optional session metadata (date, number, campaign, etc.)
        """
        session_data = {
            "id": session_id,
            "tracks": tracks,
            "speaker_mapping": {},
            "transcript": None,
            "summary": None,
            "created_at": datetime.now().isoformat(),
            "session_metadata": session_metadata or {
                "session_date": None,
                "session_number": None,
                "campaign_id": None,
                "campaign_name": None,
                "locations": [],
                "characters_present": [],
                "tags": [],
                "notes": ""
            }
        }

        self.sessions[session_id] = session_data
        self._save_session(session_id)

        logger.info(f"Created session {session_id} with {len(tracks)} tracks")

    def get_session(self, session_id: str) -> Optional[Dict]:
        """
        Get session data

        Args:
            session_id: Session identifier

        Returns:
            Session data or None if not found
        """
        if session_id in self.sessions:
            return self.sessions[session_id]

        # Try to load from disk
        session_file = self.session_dir / f"{session_id}.json"
        if session_file.exists():
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                    self.sessions[session_id] = session_data
                    return session_data
            except (json.JSONDecodeError, FileNotFoundError):
                logger.error(f"Could not load session {session_id}")

        return None

    def set_speaker_mapping(self, session_id: str, mapping: Dict[str, Any]):
        """
        Set speaker mapping for a session

        Args:
            session_id: Session identifier
            mapping: Track ID to speaker info mapping (dict with playerName, characterName, pronouns)
                    or legacy string format for backward compatibility
        """
        session = self.get_session(session_id)
        if session:
            session["speaker_mapping"] = mapping
            self._save_session(session_id)
            logger.info(f"Updated speaker mapping for session {session_id}")
        else:
            raise ValueError(f"Session {session_id} not found")

    def set_session_metadata(self, session_id: str, metadata: Dict[str, Any]):
        """
        Set session metadata

        Args:
            session_id: Session identifier
            metadata: Session metadata (date, number, campaign, etc.)
        """
        session = self.get_session(session_id)
        if session:
            if "session_metadata" not in session:
                session["session_metadata"] = {}
            session["session_metadata"].update(metadata)
            self._save_session(session_id)
            logger.info(f"Updated session metadata for session {session_id}")
        else:
            raise ValueError(f"Session {session_id} not found")

    def get_session_metadata(self, session_id: str) -> Dict[str, Any]:
        """
        Get session metadata

        Args:
            session_id: Session identifier

        Returns:
            Session metadata or empty dict if not found
        """
        session = self.get_session(session_id)
        if session:
            return session.get("session_metadata", {})
        return {}

    def update_session(self, session_id: str, updates: Dict[str, Any]):
        """
        Update session with new data

        Args:
            session_id: Session identifier
            updates: Data to update
        """
        session = self.get_session(session_id)
        if session:
            session.update(updates)
            self._save_session(session_id)
        else:
            raise ValueError(f"Session {session_id} not found")

    def _save_session(self, session_id: str):
        """Save session data to disk"""
        session_data = self.sessions.get(session_id)
        if session_data:
            session_file = self.session_dir / f"{session_id}.json"
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, indent=2, ensure_ascii=False)

    def cleanup_session(self, session_id: str):
        """
        Clean up session data and files

        Args:
            session_id: Session identifier
        """
        # Remove from memory
        if session_id in self.sessions:
            del self.sessions[session_id]

        # Remove session file
        session_file = self.session_dir / f"{session_id}.json"
        if session_file.exists():
            session_file.unlink()

        # Clean up audio files
        from audio.extraction import cleanup_session
        cleanup_session(session_id)

        logger.info(f"Cleaned up session {session_id}")

    def list_sessions(self) -> list:
        """List all available sessions"""
        sessions = []

        # Load from disk
        for session_file in self.session_dir.glob("*.json"):
            try:
                with open(session_file, 'r', encoding='utf-8') as f:
                    session_data = json.load(f)
                    # Extract useful metadata for list view
                    meta = session_data.get("session_metadata", {})
                    sessions.append({
                        "id": session_data["id"],
                        "created_at": session_data.get("created_at"),
                        "track_count": len(session_data.get("tracks", [])),
                        "session_date": meta.get("session_date"),
                        "session_number": meta.get("session_number"),
                        "campaign_name": meta.get("campaign_name"),
                        "summary_preview": (session_data.get("summary") or "")[:100] + "..." if session_data.get("summary") else None
                    })
            except (json.JSONDecodeError, KeyError):
                continue

        return sorted(sessions, key=lambda x: x["created_at"] or "", reverse=True)

    def generate_obsidian_content(self, session_id: str, summary: str, config_manager) -> str:
        """
        Generate Obsidian-formatted content with YAML frontmatter

        Args:
            session_id: Session identifier
            summary: Generated session summary
            config_manager: ConfigManager instance for accessing settings

        Returns:
            Formatted markdown content with YAML frontmatter
        """
        session = self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        metadata = session.get("session_metadata", {})
        obsidian_settings = config_manager.get_obsidian_settings()

        # Build YAML frontmatter
        frontmatter = []
        frontmatter.append("---")

        if metadata.get("session_date"):
            frontmatter.append(f"session_date: {metadata['session_date']}")

        if metadata.get("session_number"):
            frontmatter.append(f"session_number: {metadata['session_number']}")

        if metadata.get("campaign_name"):
            # Use wiki-style links for Obsidian
            frontmatter.append(f"campaign: \"[[{metadata['campaign_name']}]]\"")

        if metadata.get("locations"):
            # Format as YAML list
            locations = metadata["locations"]
            if locations:
                frontmatter.append("locations:")
                for location in locations:
                    frontmatter.append(f"  - \"[[{location}]]\"")

        if metadata.get("characters_present"):
            # Format as YAML list
            characters = metadata["characters_present"]
            if characters:
                frontmatter.append("characters:")
                for character in characters:
                    frontmatter.append(f"  - \"[[{character}]]\"")

        # Add tags
        tags = metadata.get("tags", [])
        default_tags = ["ttrpg", "session-notes"]

        if metadata.get("campaign_id"):
            default_tags.append(metadata["campaign_id"].lower().replace(" ", "-"))

        all_tags = list(set(default_tags + tags))
        if all_tags:
            frontmatter.append("tags:")
            for tag in all_tags:
                frontmatter.append(f"  - {tag}")

        frontmatter.append("---")
        frontmatter.append("")

        # Add title
        title_parts = []
        if metadata.get("campaign_name"):
            title_parts.append(metadata["campaign_name"])

        if metadata.get("session_number"):
            title_parts.append(f"Session {metadata['session_number']}")

        if metadata.get("session_date"):
            title_parts.append(metadata["session_date"])

        if title_parts:
            frontmatter.append(f"# {' - '.join(title_parts)}")
            frontmatter.append("")

        # Add locations if present
        if metadata.get("locations"):
            locations = metadata["locations"]
            if locations:
                if len(locations) == 1:
                    frontmatter.append(f"**Location:** [[{locations[0]}]]")
                else:
                    frontmatter.append("**Locations Visited:**")
                    for location in locations:
                        frontmatter.append(f"- [[{location}]]")
                frontmatter.append("")

        # Add characters present
        if metadata.get("characters_present"):
            frontmatter.append("**Characters Present:**")
            for character in metadata["characters_present"]:
                frontmatter.append(f"- [[{character}]]")
            frontmatter.append("")

        # Add notes if present
        if metadata.get("notes"):
            frontmatter.append("**Session Notes:**")
            frontmatter.append(metadata["notes"])
            frontmatter.append("")

        # Add the generated summary
        frontmatter.append(summary)

        return "\n".join(frontmatter)

    def generate_filename(self, session_id: str, config_manager) -> str:
        """
        Generate filename based on session metadata and settings

        Args:
            session_id: Session identifier
            config_manager: ConfigManager instance for accessing settings

        Returns:
            Generated filename
        """
        session = self.get_session(session_id)
        if not session:
            return "session_notes.md"

        metadata = session.get("session_metadata", {})
        obsidian_settings = config_manager.get_obsidian_settings()

        template = obsidian_settings.get("file_naming", "Session {session_number:02d} - {session_date}")

        # Prepare formatting variables
        locations = metadata.get("locations", [])

        # Use first location for filename, or "Multiple" if more than one
        location_for_filename = ""
        if locations:
            if len(locations) == 1:
                location_for_filename = locations[0]
            else:
                location_for_filename = "Multiple Locations"

        format_vars = {
            "session_number": metadata.get("session_number", 1),
            "session_date": metadata.get("session_date", "Unknown"),
            "campaign_name": metadata.get("campaign_name", "Campaign"),
            "location": location_for_filename,
            "locations": ", ".join(locations) if locations else ""
        }

        try:
            filename = template.format(**format_vars)
        except (KeyError, ValueError):
            # Fallback to basic naming if template fails
            filename = f"Session {format_vars['session_number']:02d} - {format_vars['session_date']}"

        return f"{filename}.md"
