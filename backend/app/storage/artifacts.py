"""Artifact storage operations (transcripts and summaries)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.storage.db import get_connection


def insert_artifact(
    session_id: str,
    kind: str,
    provider: str,
    model: str,
    file_path: str,
) -> dict[str, Any]:
    """Insert an artifact row and return it as a dict."""
    created_at = datetime.now().isoformat()
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO artifacts (session_id, kind, provider, model, file_path, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (session_id, kind, provider, model, file_path, created_at),
    )
    conn.commit()
    return {
        "id": cursor.lastrowid,
        "session_id": session_id,
        "kind": kind,
        "provider": provider,
        "model": model,
        "file_path": file_path,
        "created_at": created_at,
    }


def list_artifacts(
    session_id: str, kind: str | None = None
) -> list[dict[str, Any]]:
    """List artifacts for a session, optionally filtered by kind."""
    conn = get_connection()
    if kind:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE session_id = ? AND kind = ? ORDER BY created_at DESC",
            (session_id, kind),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at DESC",
            (session_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_artifact(artifact_id: int) -> dict[str, Any] | None:
    """Get a single artifact by ID."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM artifacts WHERE id = ?", (artifact_id,)
    ).fetchone()
    return dict(row) if row else None


def delete_artifact(artifact_id: int) -> None:
    """Delete an artifact row (caller handles file cleanup)."""
    conn = get_connection()
    conn.execute("DELETE FROM artifacts WHERE id = ?", (artifact_id,))
    conn.commit()


def delete_artifacts_for_session(session_id: str) -> None:
    """Delete all artifact rows for a session."""
    conn = get_connection()
    conn.execute("DELETE FROM artifacts WHERE session_id = ?", (session_id,))
    conn.commit()
