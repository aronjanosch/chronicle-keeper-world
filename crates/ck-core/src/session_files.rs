//! Session file I/O: write and sync the canonical 1.7 session files
//! (`session.toml`, `transcript.md`, `summary.md`) that sit alongside audio
//! inside `Sessions/<NNN>/`. These are TRUTH for vault worlds; SQLite is cache.

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use crate::error::AppResult;

// ── Path helpers ──────────────────────────────────────────────────

pub fn audio_dir(session_path: &Path) -> PathBuf {
    session_path.join("audio")
}

pub fn session_toml_path(session_path: &Path) -> PathBuf {
    session_path.join("session.toml")
}

pub fn transcript_md_path(session_path: &Path) -> PathBuf {
    session_path.join("transcript.md")
}

pub fn summary_md_path(session_path: &Path) -> PathBuf {
    session_path.join("summary.md")
}

/// True when the session_path is in the 1.7 vault layout (parent named "Sessions").
/// Used to gate file writes so non-vault / old-layout sessions are left alone.
pub fn is_vault_session_path(session_path: &str) -> bool {
    Path::new(session_path)
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n == "Sessions")
        .unwrap_or(false)
}

// ── Writers ───────────────────────────────────────────────────────

/// Write (or overwrite) `session.toml` with the canonical metadata + speaker map.
pub fn write_session_toml(
    session_path: &Path,
    number: Option<i64>,
    title: Option<&str>,
    date: Option<&str>,
    language: &str,
    tracks: &Value,
    speakers: &Value,
) -> std::io::Result<()> {
    let mut out = String::new();

    if let Some(n) = number {
        out.push_str(&format!("number = {n}\n"));
    }
    if let Some(d) = date.filter(|s| !s.is_empty()) {
        out.push_str(&format!("date = \"{}\"\n", toml_escape(d)));
    }
    if let Some(t) = title.filter(|s| !s.is_empty()) {
        out.push_str(&format!("title = \"{}\"\n", toml_escape(t)));
    }
    if !language.is_empty() {
        out.push_str(&format!("language = \"{}\"\n", toml_escape(language)));
    }

    // Speaker map: track_id → speaker entry
    let speaker_by_track: std::collections::HashMap<&str, &Value> = speakers
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|s| {
                    s.get("track_id")
                        .and_then(Value::as_str)
                        .map(|t| (t, s))
                })
                .collect()
        })
        .unwrap_or_default();

    if let Some(track_list) = tracks.as_array() {
        if !track_list.is_empty() {
            out.push('\n');
        }
        for track in track_list {
            let Some(filename) = track.get("filename").and_then(Value::as_str) else {
                continue;
            };
            let track_id = track.get("id").and_then(Value::as_str).unwrap_or(filename);
            out.push_str("[[track]]\n");
            out.push_str(&format!("filename = \"{}\"\n", toml_escape(filename)));
            if let Some(s) = speaker_by_track.get(track_id) {
                push_str_field(&mut out, "speaker", s.get("player_name").and_then(Value::as_str));
                push_str_field(&mut out, "character", s.get("character_name").and_then(Value::as_str));
                push_str_field(&mut out, "pronouns", s.get("pronouns").and_then(Value::as_str));
            }
        }
    }

    std::fs::write(session_toml_path(session_path), out.as_bytes())
}

pub fn write_transcript_md(session_path: &Path, text: &str) -> std::io::Result<()> {
    std::fs::write(transcript_md_path(session_path), text.as_bytes())
}

/// Write `summary.md` with Obsidian-compatible frontmatter.
pub fn write_summary_md(
    session_path: &Path,
    text: &str,
    number: Option<i64>,
    date: Option<&str>,
    title: Option<&str>,
    provider: &str,
    model: &str,
    generated_at: &str,
) -> std::io::Result<()> {
    let mut content = String::from("---\n");
    if let Some(n) = number {
        content.push_str(&format!("session: {n}\n"));
    }
    if let Some(d) = date.filter(|s| !s.is_empty()) {
        content.push_str(&format!("date: \"{}\"\n", yaml_escape(d)));
    }
    if let Some(t) = title.filter(|s| !s.is_empty()) {
        content.push_str(&format!("title: \"{}\"\n", yaml_escape(t)));
    }
    content.push_str(&format!("provider: {provider}\nmodel: {model}\ngenerated_at: {generated_at}\n---\n\n"));
    content.push_str(text.trim());
    content.push('\n');
    std::fs::write(summary_md_path(session_path), content.as_bytes())
}

// ── DB-backed sync ────────────────────────────────────────────────

/// Read the current session state from DB and write (or overwrite) `session.toml`.
/// No-op for non-vault sessions or when session_path doesn't exist.
pub fn sync_session_toml(conn: &Connection, session_id: &str) -> AppResult<()> {
    let row: Option<(Option<i64>, Option<String>, Option<String>, String, String, String, Option<String>)> = conn
        .query_row(
            "SELECT session_number, title, date, session_path, tracks_json, speakers_json, campaign_id \
             FROM sessions WHERE session_id = ?1",
            params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        )
        .optional()?;
    let Some((number, title, date, session_path, tracks_json, speakers_json, campaign_id)) = row else {
        return Ok(());
    };
    if !is_vault_session_path(&session_path) {
        return Ok(());
    }
    let path = Path::new(&session_path);
    if !path.exists() {
        return Ok(());
    }
    let language = campaign_id
        .as_deref()
        .and_then(|cid| crate::store::campaigns::get_campaign(conn, cid).ok().flatten())
        .map(|c| c.default_language)
        .unwrap_or_else(|| "en".into());
    let tracks = serde_json::from_str(&tracks_json).unwrap_or(Value::Array(vec![]));
    let speakers = serde_json::from_str(&speakers_json).unwrap_or(Value::Array(vec![]));
    let _ = write_session_toml(path, number, title.as_deref(), date.as_deref(), &language, &tracks, &speakers);
    Ok(())
}

// ── Migration helpers ─────────────────────────────────────────────

/// Copy audio from `src` into `dst/` and verify each copy by size. Copy-only,
/// never deletes. A missing `src` is Ok(0) — originals may be long gone while
/// transcript/summary still exist.
pub fn copy_audio_files(src: &Path, dst: &Path) -> std::io::Result<usize> {
    if !src.is_dir() {
        return Ok(0);
    }
    std::fs::create_dir_all(dst)?;
    let mut copied: Vec<(PathBuf, PathBuf)> = Vec::new();
    collect_and_copy_audio(src, dst, &mut copied)?;
    for (from, to) in &copied {
        if from.metadata()?.len() != to.metadata()?.len() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("size mismatch after copy: {}", to.display()),
            ));
        }
    }
    Ok(copied.len())
}

fn collect_and_copy_audio(
    src: &Path,
    dst: &Path,
    copied: &mut Vec<(PathBuf, PathBuf)>,
) -> std::io::Result<()> {
    const AUDIO_EXTS: &[&str] = &["flac", "wav", "mp3", "m4a", "ogg"];
    for entry in std::fs::read_dir(src)?.flatten() {
        let from = entry.path();
        if from.is_dir() {
            let sub = dst.join(entry.file_name());
            std::fs::create_dir_all(&sub)?;
            collect_and_copy_audio(&from, &sub, copied)?;
        } else if from
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| AUDIO_EXTS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false)
        {
            let to = dst.join(entry.file_name());
            std::fs::copy(&from, &to)?;
            copied.push((from, to));
        }
    }
    Ok(())
}

pub fn write_notes_md(session_path: &Path, text: &str) -> std::io::Result<()> {
    std::fs::write(session_path.join("notes.md"), text.as_bytes())
}

// ── Internal helpers ──────────────────────────────────────────────

fn toml_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn yaml_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn push_str_field(out: &mut String, key: &str, val: Option<&str>) {
    if let Some(v) = val.filter(|s| !s.is_empty()) {
        out.push_str(&format!("{key} = \"{}\"\n", toml_escape(v)));
    }
}

/// Zero-pad a session number to 3 digits (expands for 4+ digit numbers).
pub fn padded_number(n: i64) -> String {
    format!("{n:03}")
}

/// Compute the vault session path: `<world_root>/Sessions/<NNN>/`.
/// `vault_codex_path` is the campaign's `vault_path` column (= `<world_root>/Codex`).
pub fn vault_session_path(vault_codex_path: &str, number: i64) -> Option<PathBuf> {
    let world_root = Path::new(vault_codex_path).parent()?;
    Some(world_root.join("Sessions").join(padded_number(number)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_vault_session_path_works() {
        assert!(is_vault_session_path("/home/aron/Chronicle Keeper/Ashfall/Sessions/001"));
        assert!(is_vault_session_path("/home/aron/Chronicle Keeper/Ashfall/Sessions/42"));
        assert!(!is_vault_session_path("/home/aron/ck/ashfall/1"));
        assert!(!is_vault_session_path("/home/aron/Sessions-backup/ashfall/1")); // parent not exactly "Sessions"
    }

    #[test]
    fn vault_session_path_rounds_correctly() {
        let p = vault_session_path("/home/aron/Ashfall/Codex", 1).unwrap();
        assert!(p.ends_with("Sessions/001"));
        let p2 = vault_session_path("/home/aron/Ashfall/Codex", 42).unwrap();
        assert!(p2.ends_with("Sessions/042"));
        let p3 = vault_session_path("/home/aron/Ashfall/Codex", 1000).unwrap();
        assert!(p3.ends_with("Sessions/1000"));
    }

    #[test]
    fn write_session_toml_format() {
        let dir = std::env::temp_dir().join(format!("ck-sf-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tracks = serde_json::json!([{"id": "aria", "filename": "track-aria.flac"}]);
        let speakers = serde_json::json!([{"track_id": "aria", "player_name": "Aron", "character_name": "Lyra", "pronouns": "she/her"}]);
        write_session_toml(&dir, Some(1), Some("The Iron Crown"), Some("2025-01-15"), "en", &tracks, &speakers).unwrap();
        let content = std::fs::read_to_string(session_toml_path(&dir)).unwrap();
        assert!(content.contains("number = 1"));
        assert!(content.contains("title = \"The Iron Crown\""));
        assert!(content.contains("filename = \"track-aria.flac\""));
        assert!(content.contains("speaker = \"Aron\""));
        assert!(content.contains("character = \"Lyra\""));
        std::fs::remove_dir_all(&dir).ok();
    }
}
