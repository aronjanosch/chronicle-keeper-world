use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::AppResult;
use crate::models::ArtifactInfo;

/// Insert an artifact. Content is stored inline in the DB (core principle #1:
/// everything in SQLite, no loose files). A stable `artifact_id` UUID
/// identifies the row across DBs (the 0.X→1.0 migration keys on it).
pub fn insert_artifact(
    conn: &Connection,
    session_id: &str,
    kind: &str,
    provider: &str,
    model: &str,
    content: &str,
) -> AppResult<ArtifactInfo> {
    let created_at = Local::now()
        .naive_local()
        .format("%Y-%m-%dT%H:%M:%S%.6f")
        .to_string();
    let artifact_id = Uuid::new_v4().to_string();
    conn.execute(
        // file_path is dead legacy (content is inline now) but is NOT NULL with no
        // default on DBs created before the schema added one — write '' explicitly.
        "INSERT INTO artifacts (artifact_id, session_id, kind, provider, model, file_path, content, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, '', ?6, ?7)",
        params![artifact_id, session_id, kind, provider, model, content, created_at],
    )?;
    let id = conn.last_insert_rowid();
    Ok(ArtifactInfo {
        id,
        artifact_id,
        session_id: session_id.to_string(),
        kind: kind.to_string(),
        provider: provider.to_string(),
        model: model.to_string(),
        created_at,
    })
}

fn row_to_artifact(row: &rusqlite::Row) -> rusqlite::Result<ArtifactInfo> {
    Ok(ArtifactInfo {
        id: row.get("id")?,
        artifact_id: row.get("artifact_id")?,
        session_id: row.get("session_id")?,
        kind: row.get("kind")?,
        provider: row.get("provider")?,
        model: row.get("model")?,
        created_at: row.get("created_at")?,
    })
}

const COLS: &str = "id, artifact_id, session_id, kind, provider, model, created_at";

pub fn list_artifacts(
    conn: &Connection,
    session_id: &str,
    kind: Option<&str>,
) -> AppResult<Vec<ArtifactInfo>> {
    let mut out = Vec::new();
    match kind {
        Some(k) => {
            let mut stmt = conn.prepare(&format!(
                "SELECT {COLS} FROM artifacts WHERE session_id = ?1 AND kind = ?2 ORDER BY created_at DESC",
            ))?;
            let rows = stmt.query_map(params![session_id, k], row_to_artifact)?;
            for r in rows {
                out.push(r?);
            }
        }
        None => {
            let mut stmt = conn.prepare(&format!(
                "SELECT {COLS} FROM artifacts WHERE session_id = ?1 ORDER BY created_at DESC",
            ))?;
            let rows = stmt.query_map(params![session_id], row_to_artifact)?;
            for r in rows {
                out.push(r?);
            }
        }
    }
    Ok(out)
}

pub fn get_artifact(conn: &Connection, id: i64) -> AppResult<Option<ArtifactInfo>> {
    let art = conn
        .query_row(
            &format!("SELECT {COLS} FROM artifacts WHERE id = ?1"),
            params![id],
            row_to_artifact,
        )
        .optional()?;
    Ok(art)
}

/// Inline content for a single artifact by row id.
pub fn get_content(conn: &Connection, id: i64) -> AppResult<Option<String>> {
    let content = conn
        .query_row(
            "SELECT content FROM artifacts WHERE id = ?1",
            params![id],
            |r| r.get::<_, String>(0),
        )
        .optional()?;
    Ok(content)
}

pub fn delete_artifact(conn: &Connection, id: i64) -> AppResult<()> {
    conn.execute("DELETE FROM artifacts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn delete_artifacts_for_session(conn: &Connection, session_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM artifacts WHERE session_id = ?1",
        params![session_id],
    )?;
    Ok(())
}

/// Inline content of the latest artifact of a kind, if any.
pub fn latest_content(
    conn: &Connection,
    session_id: &str,
    kind: &str,
) -> AppResult<Option<String>> {
    let content = conn
        .query_row(
            "SELECT content FROM artifacts WHERE session_id = ?1 AND kind = ?2 ORDER BY created_at DESC LIMIT 1",
            params![session_id, kind],
            |r| r.get::<_, String>(0),
        )
        .optional()?;
    Ok(content)
}

pub fn has_kind(conn: &Connection, session_id: &str, kind: &str) -> AppResult<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM artifacts WHERE session_id = ?1 AND kind = ?2",
        params![session_id, kind],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

/// Every session id that has at least one artifact of `kind`. Lets list views
/// resolve has-transcript / has-summary in one query instead of a COUNT per
/// session (avoids an N+1 over the session list).
pub fn session_ids_with_kind(
    conn: &Connection,
    kind: &str,
) -> AppResult<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT session_id FROM artifacts WHERE kind = ?1")?;
    let ids = stmt
        .query_map(params![kind], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<std::collections::HashSet<_>>>()?;
    Ok(ids)
}
