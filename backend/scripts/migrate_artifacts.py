"""Backfill the artifacts table from existing transcript/summary files on disk.

Run once after upgrading to the artifacts schema:
    cd backend && uv run python scripts/migrate_artifacts.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.storage.db import get_connection
from app.storage.config import get_config


def main() -> None:
    conn = get_connection()
    config = get_config()
    output_root = Path(config["output_root"]).expanduser()
    if not output_root.exists():
        print(f"Output root does not exist: {output_root}")
        return

    count = 0
    for session_file in output_root.rglob("session.json"):
        if session_file.parent.name == "transcriptions":
            continue
        try:
            data = json.loads(session_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        session_id = data.get("session_id")
        if not session_id:
            continue
        session_dir = session_file.parent

        # Backfill transcripts
        transcription_root = session_dir / "transcriptions"
        if transcription_root.exists():
            for txt in transcription_root.glob("*/transcript.txt"):
                # Check if already exists
                existing = conn.execute(
                    "SELECT 1 FROM artifacts WHERE session_id = ? AND file_path = ?",
                    (session_id, str(txt)),
                ).fetchone()
                if existing:
                    continue
                folder_name = txt.parent.name
                parts = folder_name.split("_", 1)
                provider = parts[0] if len(parts) > 1 else "whisperx"
                model = parts[1] if len(parts) > 1 else folder_name
                try:
                    created = datetime.fromtimestamp(txt.stat().st_mtime).isoformat()
                except OSError:
                    created = datetime.now().isoformat()
                conn.execute(
                    "INSERT INTO artifacts (session_id, kind, provider, model, file_path, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (session_id, "transcript", provider, model, str(txt), created),
                )
                count += 1

        # Backfill summaries
        summary_dir = session_dir / "summaries"
        if summary_dir.exists():
            for md in summary_dir.rglob("summary.md"):
                existing = conn.execute(
                    "SELECT 1 FROM artifacts WHERE session_id = ? AND file_path = ?",
                    (session_id, str(md)),
                ).fetchone()
                if existing:
                    continue
                summary_data = data.get("summary") or {}
                provider = summary_data.get("provider", "unknown")
                model = summary_data.get("model", "unknown")
                try:
                    created = datetime.fromtimestamp(md.stat().st_mtime).isoformat()
                except OSError:
                    created = datetime.now().isoformat()
                conn.execute(
                    "INSERT INTO artifacts (session_id, kind, provider, model, file_path, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (session_id, "summary", provider, model, str(md), created),
                )
                count += 1

    conn.commit()
    print(f"Backfilled {count} artifact rows.")


if __name__ == "__main__":
    main()
