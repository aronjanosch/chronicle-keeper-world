//! Per-world `.ck/index.db` — a rebuildable cache over the vault's `.md`
//! pages: wikilink graph, aliases, tags, headings, FTS. Never source of truth;
//! deleting the file is safe (rebuilt on next open).

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::error::{AppError, AppResult};
use crate::vault;

pub const SCHEMA_VERSION: &str = "3";

const SCHEMA: &str = "
CREATE TABLE pages (
    path         TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    kind         TEXT,
    summary      TEXT,
    frontmatter  TEXT,
    content_hash TEXT NOT NULL,
    modified_at  INTEGER NOT NULL
);
CREATE TABLE page_aliases (
    alias     TEXT NOT NULL,
    page_path TEXT NOT NULL REFERENCES pages(path) ON DELETE CASCADE,
    PRIMARY KEY (alias, page_path)
);
CREATE INDEX idx_aliases_alias ON page_aliases(alias);
CREATE TABLE page_tags (
    page_path TEXT NOT NULL REFERENCES pages(path) ON DELETE CASCADE,
    tag       TEXT NOT NULL,
    PRIMARY KEY (page_path, tag)
);
CREATE INDEX idx_tags_tag ON page_tags(tag);
CREATE TABLE page_links (
    source_path TEXT NOT NULL REFERENCES pages(path) ON DELETE CASCADE,
    target_path TEXT,
    link_text   TEXT NOT NULL,
    heading     TEXT,
    PRIMARY KEY (source_path, link_text)
);
CREATE INDEX idx_links_target ON page_links(target_path);
CREATE TABLE page_headings (
    page_path TEXT NOT NULL REFERENCES pages(path) ON DELETE CASCADE,
    level     INTEGER NOT NULL,
    text      TEXT NOT NULL,
    anchor    TEXT NOT NULL,
    PRIMARY KEY (page_path, anchor)
);
CREATE VIRTUAL TABLE pages_fts USING fts5(path UNINDEXED, title, summary, body);
CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
";

/// World root for a campaign's vault path. Resolved by the `.ck/config.toml`
/// marker (vault itself, else its parent — `…/<World>/Codex` → `…/<World>`);
/// falls back on the folder name for not-yet-provisioned vaults. Adopted
/// foreign vaults (`codex_root = "."`) keep `.ck` inside the vault itself.
pub fn world_root_of(vault: &Path) -> &Path {
    if crate::world_config::config_path(vault).exists() {
        return vault;
    }
    if let Some(parent) = vault.parent() {
        if crate::world_config::config_path(parent).exists() {
            return parent;
        }
    }
    if vault.file_name().map(|n| n == "Codex").unwrap_or(false) {
        vault.parent().unwrap_or(vault)
    } else {
        vault
    }
}

pub fn index_db_path(vault: &Path) -> PathBuf {
    world_root_of(vault).join(".ck").join("index.db")
}

/// Open (creating/migrating as needed). Version mismatch → drop + recreate.
pub fn open_index(vault: &Path) -> AppResult<Connection> {
    let path = index_db_path(vault);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("create .ck: {e}")))?;
    }
    let conn = Connection::open(&path)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("open index.db: {e}")))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let version: Option<String> = conn
        .query_row("SELECT value FROM index_meta WHERE key = 'schema_version'", [], |r| r.get(0))
        .ok();
    if version.as_deref() != Some(SCHEMA_VERSION) {
        recreate(&conn)?;
    }
    Ok(conn)
}

fn recreate(conn: &Connection) -> AppResult<()> {
    let names: Vec<(String, String)> = {
        let mut stmt = conn.prepare(
            "SELECT type, name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'",
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.filter_map(Result::ok).collect()
    };
    for (ty, name) in names {
        // fts5 shadow tables drop with their virtual table; ignore failures.
        let _ = conn.execute_batch(&format!("DROP {ty} IF EXISTS \"{name}\""));
    }
    conn.execute_batch(SCHEMA)?;
    conn.execute(
        "INSERT INTO index_meta (key, value) VALUES ('schema_version', ?1), ('last_full_rebuild', '')",
        params![SCHEMA_VERSION],
    )?;
    Ok(())
}

// ── Parsing ───────────────────────────────────────────────────────

#[derive(Debug)]
pub struct RawLink {
    pub link_text: String,   // raw inside [[ ]], incl. #heading and |label
    pub target_name: String, // normalized name segment
    pub heading: Option<String>, // anchor slug if [[Page#Heading]]
}

#[derive(Debug)]
pub struct ParsedPage {
    pub path: String,
    pub title: String,
    pub kind: Option<String>,
    pub summary: String,
    pub frontmatter_json: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub headings: Vec<(i64, String, String)>, // (level, text, anchor)
    pub links: Vec<RawLink>,
    pub content_hash: String,
    pub modified_at: i64,
}

pub(crate) fn normalize_name(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn anchor_of(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c == ' ' { '-' } else { c })
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-')
        .collect()
}

fn fnv1a(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

// Body scan for headings + wikilinks, skipping fenced code blocks.
// `![[embeds]]` are skipped (media/transclusion deferred).
fn scan_body(body: &str, headings: &mut Vec<(i64, String, String)>, links: &mut Vec<RawLink>) {
    let mut in_fence = false;
    for line in body.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix('#') {
            let level = 1 + rest.chars().take_while(|c| *c == '#').count();
            let text = rest.trim_start_matches('#').trim();
            if level <= 6 && !text.is_empty() && trimmed.as_bytes().get(level) == Some(&b' ') {
                let anchor = anchor_of(text);
                if !anchor.is_empty() && !headings.iter().any(|(_, _, a)| a == &anchor) {
                    headings.push((level as i64, text.to_string(), anchor));
                }
            }
        }
        let bytes = line.as_bytes();
        let mut i = 0;
        while let Some(start) = line[i..].find("[[").map(|p| p + i) {
            let embed = start > 0 && bytes.get(start - 1) == Some(&b'!');
            let Some(end) = line[start + 2..].find("]]").map(|p| p + start + 2) else {
                break;
            };
            let raw = &line[start + 2..end];
            i = end + 2;
            if embed || raw.trim().is_empty() {
                continue;
            }
            let target = raw.split('|').next().unwrap_or(raw);
            let (name, heading) = match target.split_once('#') {
                // Block refs ([[Page#^id]]) are a locked Drop — not indexed.
                Some((_, h)) if h.starts_with('^') => continue,
                Some((n, h)) => (n, Some(anchor_of(h))),
                None => (target, None),
            };
            let name = normalize_name(name);
            if name.is_empty() {
                continue;
            }
            if !links.iter().any(|l| l.link_text == raw) {
                links.push(RawLink {
                    link_text: raw.to_string(),
                    target_name: name,
                    heading: heading.filter(|h| !h.is_empty()),
                });
            }
        }
    }
}

pub fn parse_page(vault_root: &Path, abs: &Path, content: &str) -> ParsedPage {
    let (fm, body) = vault::split_frontmatter(content);
    let title = abs
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let summary = vault::fm_get(&fm, "summary")
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_default();
    let frontmatter_json = serde_json::Value::Object(
        fm.iter()
            .map(|(k, v)| {
                let val = if v.len() == 1 {
                    serde_json::Value::String(v[0].clone())
                } else {
                    serde_json::Value::Array(v.iter().cloned().map(serde_json::Value::String).collect())
                };
                (k.clone(), val)
            })
            .collect(),
    )
    .to_string();

    let mut aliases: Vec<String> = vec![normalize_name(&title)];
    for a in vault::fm_list(&fm, "aliases") {
        let n = normalize_name(a);
        if !n.is_empty() && !aliases.contains(&n) {
            aliases.push(n);
        }
    }
    let mut tags: Vec<String> = Vec::new();
    for t in vault::fm_list(&fm, "tags") {
        let t = t.trim().trim_start_matches('#').to_string();
        if !t.is_empty() && !tags.contains(&t) {
            tags.push(t);
        }
    }

    let mut headings = Vec::new();
    let mut links = Vec::new();
    scan_body(body, &mut headings, &mut links);

    let rel = abs
        .strip_prefix(vault_root)
        .unwrap_or(abs)
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
    let modified_at = abs
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    ParsedPage {
        path: rel,
        title,
        kind: vault::fm_get(&fm, "kind").filter(|s| !s.is_empty()).map(str::to_string),
        summary,
        frontmatter_json,
        aliases,
        tags,
        headings,
        links,
        content_hash: fnv1a(content.as_bytes()),
        modified_at,
    }
}

// ── Writes ────────────────────────────────────────────────────────

fn insert_page(conn: &Connection, p: &ParsedPage, body: &str) -> AppResult<()> {
    // INSERT OR REPLACE deletes the old row → CASCADE wipes child rows.
    conn.execute(
        "INSERT OR REPLACE INTO pages (path, title, kind, summary, frontmatter, content_hash, modified_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![p.path, p.title, p.kind, p.summary, p.frontmatter_json, p.content_hash, p.modified_at],
    )?;
    for alias in &p.aliases {
        conn.execute(
            "INSERT OR IGNORE INTO page_aliases (alias, page_path) VALUES (?1, ?2)",
            params![alias, p.path],
        )?;
    }
    for tag in &p.tags {
        conn.execute(
            "INSERT OR IGNORE INTO page_tags (page_path, tag) VALUES (?1, ?2)",
            params![p.path, tag],
        )?;
    }
    for (level, text, anchor) in &p.headings {
        conn.execute(
            "INSERT OR IGNORE INTO page_headings (page_path, level, text, anchor) VALUES (?1, ?2, ?3, ?4)",
            params![p.path, level, text, anchor],
        )?;
    }
    for link in &p.links {
        conn.execute(
            "INSERT OR IGNORE INTO page_links (source_path, target_path, link_text, heading) VALUES (?1, NULL, ?2, ?3)",
            params![p.path, link.link_text, link.heading],
        )?;
    }
    conn.execute("DELETE FROM pages_fts WHERE path = ?1", params![p.path])?;
    conn.execute(
        "INSERT INTO pages_fts (path, title, summary, body) VALUES (?1, ?2, ?3, ?4)",
        params![p.path, p.title, p.summary, body],
    )?;
    Ok(())
}

/// Re-index one page from disk (or drop it if the file is gone).
pub fn upsert_path(conn: &Connection, vault_root: &Path, rel: &str) -> AppResult<()> {
    let abs = vault_root.join(rel);
    let Ok(content) = std::fs::read_to_string(&abs) else {
        return remove_path(conn, rel);
    };
    let parsed = parse_page(vault_root, &abs, &content);
    let (_, body) = vault::split_frontmatter(&content);
    insert_page(conn, &parsed, body)?;
    resolve_links(conn)
}

pub fn remove_path(conn: &Connection, rel: &str) -> AppResult<()> {
    conn.execute("DELETE FROM pages WHERE path = ?1", params![rel])?;
    conn.execute("DELETE FROM pages_fts WHERE path = ?1", params![rel])?;
    resolve_links(conn)
}

/// Full scan with content_hash skip. Idempotent, cheap on a warm index.
pub fn rebuild(conn: &Connection, vault_root: &Path) -> AppResult<()> {
    let mut files = Vec::new();
    collect_md(vault_root, &mut files);
    let tx = conn.unchecked_transaction()?;
    let mut seen: Vec<String> = Vec::with_capacity(files.len());
    for abs in &files {
        let Ok(content) = std::fs::read_to_string(abs) else {
            continue;
        };
        let parsed = parse_page(vault_root, abs, &content);
        seen.push(parsed.path.clone());
        let existing: Option<String> = tx
            .query_row("SELECT content_hash FROM pages WHERE path = ?1", params![parsed.path], |r| r.get(0))
            .ok();
        if existing.as_deref() == Some(parsed.content_hash.as_str()) {
            continue;
        }
        let (_, body) = vault::split_frontmatter(&content);
        insert_page(&tx, &parsed, body)?;
    }
    // Drop rows whose file vanished.
    let stale: Vec<String> = {
        let mut stmt = tx.prepare("SELECT path FROM pages")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.filter_map(Result::ok)
            .filter(|p| !seen.contains(p))
            .collect()
    };
    for path in &stale {
        tx.execute("DELETE FROM pages WHERE path = ?1", params![path])?;
        tx.execute("DELETE FROM pages_fts WHERE path = ?1", params![path])?;
    }
    resolve_links(&tx)?;
    tx.execute(
        "INSERT OR REPLACE INTO index_meta (key, value) VALUES ('last_full_rebuild', ?1)",
        params![crate::store::now()],
    )?;
    tx.commit()?;
    Ok(())
}

fn collect_md(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            if !vault::is_reserved_dir(&name) {
                collect_md(&path, out);
            }
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(path);
        }
    }
}

/// Re-resolve every link's target against pages + aliases. Collision rule:
/// shortest path, then lexicographic. `[[Page#Heading]]` also needs the anchor.
pub fn resolve_links(conn: &Connection) -> AppResult<()> {
    let mut by_alias: HashMap<String, Vec<String>> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT alias, page_path FROM page_aliases")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for (alias, path) in rows.filter_map(Result::ok) {
            by_alias.entry(alias).or_default().push(path);
        }
    }
    for paths in by_alias.values_mut() {
        paths.sort_by(|a, b| a.len().cmp(&b.len()).then(a.cmp(b)));
    }
    let anchors: Vec<(String, String)> = {
        let mut stmt = conn.prepare("SELECT page_path, anchor FROM page_headings")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.filter_map(Result::ok).collect()
    };
    let links: Vec<(String, String, Option<String>)> = {
        let mut stmt = conn.prepare("SELECT source_path, link_text, heading FROM page_links")?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.filter_map(Result::ok).collect()
    };
    for (source, link_text, heading) in links {
        let target = link_text.split('|').next().unwrap_or(&link_text);
        let name = normalize_name(target.split('#').next().unwrap_or(target));
        let resolved = by_alias.get(&name).and_then(|paths| {
            paths
                .iter()
                .find(|p| match &heading {
                    Some(h) => anchors.iter().any(|(pp, a)| pp == *p && a == h),
                    None => true,
                })
                .cloned()
        });
        conn.execute(
            "UPDATE page_links SET target_path = ?1 WHERE source_path = ?2 AND link_text = ?3",
            params![resolved, source, link_text],
        )?;
    }
    Ok(())
}

// ── Queries ───────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize)]
pub struct LinkRow {
    pub source_path: String,
    pub target_path: Option<String>,
    pub link_text: String,
}

pub fn all_links(conn: &Connection) -> AppResult<Vec<LinkRow>> {
    let mut stmt =
        conn.prepare("SELECT source_path, target_path, link_text FROM page_links ORDER BY source_path")?;
    let rows = stmt.query_map([], |r| {
        Ok(LinkRow { source_path: r.get(0)?, target_path: r.get(1)?, link_text: r.get(2)? })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

pub fn unresolved_count(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM page_links WHERE target_path IS NULL", [], |r| r.get(0))?)
}

/// Pages with no inbound resolved link. (Session mentions not yet considered.)
pub fn orphan_count(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM pages p WHERE NOT EXISTS \
         (SELECT 1 FROM page_links l WHERE l.target_path = p.path)",
        [],
        |r| r.get(0),
    )?)
}

#[derive(Debug, serde::Serialize)]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    pub kind: Option<String>,
    pub summary: Option<String>,
    pub snippet: String,
}

pub fn search(conn: &Connection, q: &str) -> AppResult<Vec<SearchHit>> {
    let q = q.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    // Quote each token as a phrase + prefix star: FTS5 operators in user input
    // (-, ", :, [) would otherwise be syntax errors.
    let fts_query = q
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ");
    let mut stmt = conn.prepare(
        "SELECT f.path, p.title, p.kind, p.summary, snippet(pages_fts, 3, '<b>', '</b>', '…', 12) \
         FROM pages_fts f JOIN pages p ON p.path = f.path \
         WHERE pages_fts MATCH ?1 ORDER BY rank LIMIT 50",
    )?;
    let rows = stmt.query_map(params![fts_query], |r| {
        Ok(SearchHit {
            path: r.get(0)?,
            title: r.get(1)?,
            kind: r.get(2)?,
            summary: r.get(3)?,
            snippet: r.get(4)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

pub fn tag_counts(conn: &Connection) -> AppResult<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT tag, COUNT(*) FROM page_tags GROUP BY tag ORDER BY COUNT(*) DESC, tag",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.filter_map(Result::ok).collect())
}

/// path → (aliases beyond the title, tags) for enriching page lists.
pub fn page_meta(conn: &Connection) -> AppResult<HashMap<String, (Vec<String>, Vec<String>)>> {
    let mut out: HashMap<String, (Vec<String>, Vec<String>)> = HashMap::new();
    {
        let mut stmt = conn.prepare(
            "SELECT a.page_path, a.alias FROM page_aliases a JOIN pages p ON p.path = a.page_path \
             WHERE a.alias <> lower(p.title)",
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for (path, alias) in rows.filter_map(Result::ok) {
            out.entry(path).or_default().0.push(alias);
        }
    }
    {
        let mut stmt = conn.prepare("SELECT page_path, tag FROM page_tags")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for (path, tag) in rows.filter_map(Result::ok) {
            out.entry(path).or_default().1.push(tag);
        }
    }
    Ok(out)
}

/// Sources linking to `rel` (resolved), with the raw link text — rename uses this.
pub fn sources_linking_to(conn: &Connection, rel: &str) -> AppResult<Vec<(String, String)>> {
    let mut stmt =
        conn.prepare("SELECT source_path, link_text FROM page_links WHERE target_path = ?1")?;
    let rows = stmt.query_map(params![rel], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.filter_map(Result::ok).collect())
}

/// Rewrite the name segment of every `[[old_name…]]` to `new_name`, preserving
/// `#heading` and `|label`. Case-insensitive on the name; writes the new
/// title's exact casing. `None` when nothing matched.
pub fn rewrite_link_names(content: &str, old_name: &str, new_name: &str) -> Option<String> {
    let target = normalize_name(old_name);
    let mut out = String::with_capacity(content.len() + 16);
    let mut changed = false;
    let mut rest = content;
    while let Some(start) = rest.find("[[") {
        let (before, after) = rest.split_at(start + 2);
        out.push_str(before);
        let Some(end) = after.find("]]") else {
            rest = after;
            break;
        };
        let inner = &after[..end];
        let name_end = inner.find(['#', '|']).unwrap_or(inner.len());
        let (name, tail) = inner.split_at(name_end);
        if normalize_name(name) == target {
            out.push_str(new_name);
            out.push_str(tail);
            changed = true;
        } else {
            out.push_str(inner);
        }
        out.push_str("]]");
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    changed.then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_vault(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ck-index-{tag}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, rel: &str, content: &str) {
        let abs = dir.join(rel);
        std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
        std::fs::write(abs, content).unwrap();
    }

    #[test]
    fn parse_extracts_everything() {
        let dir = tmp_vault("parse");
        write(
            &dir,
            "Characters/Aragorn.md",
            "---\nkind: npc\nsummary: A ranger.\naliases:\n  - Strider\ntags: [character/ranger]\n---\n\n# Aragorn\n\nMet at [[Rivendell#Geography|the valley]] with [[Gandalf]].\n\n## Background\n\n```\n[[NotALink]]\n```\n![[portrait.png]]\n",
        );
        let abs = dir.join("Characters/Aragorn.md");
        let content = std::fs::read_to_string(&abs).unwrap();
        let p = parse_page(&dir, &abs, &content);
        assert_eq!(p.path, "Characters/Aragorn.md");
        assert_eq!(p.title, "Aragorn");
        assert_eq!(p.kind.as_deref(), Some("npc"));
        assert_eq!(p.aliases, ["aragorn", "strider"]);
        assert_eq!(p.tags, ["character/ranger"]);
        assert_eq!(p.headings.iter().map(|h| h.2.as_str()).collect::<Vec<_>>(), ["aragorn", "background"]);
        let names: Vec<&str> = p.links.iter().map(|l| l.target_name.as_str()).collect();
        assert_eq!(names, ["rivendell", "gandalf"]);
        assert_eq!(p.links[0].heading.as_deref(), Some("geography"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rebuild_resolves_and_breaks_links() {
        let dir = tmp_vault("rebuild");
        write(&dir, "Aragorn.md", "---\nkind: npc\naliases:\n  - Strider\n---\nSee [[Rivendell]] and [[Nowhere]].\n");
        write(&dir, "Rivendell.md", "---\nkind: place\n---\nHome of [[Strider]].\n## Geography\nHills.\n");
        let conn = open_index(&dir).unwrap();
        rebuild(&conn, &dir).unwrap();

        let links = all_links(&conn).unwrap();
        assert_eq!(links.len(), 3);
        let find = |src: &str, txt: &str| {
            links.iter().find(|l| l.source_path == src && l.link_text == txt).unwrap()
        };
        assert_eq!(find("Aragorn.md", "Rivendell").target_path.as_deref(), Some("Rivendell.md"));
        assert_eq!(find("Aragorn.md", "Nowhere").target_path, None);
        // alias resolution
        assert_eq!(find("Rivendell.md", "Strider").target_path.as_deref(), Some("Aragorn.md"));
        assert_eq!(unresolved_count(&conn).unwrap(), 1);

        // hash-skip rebuild is a no-op; removing a file drops its rows
        rebuild(&conn, &dir).unwrap();
        assert_eq!(all_links(&conn).unwrap().len(), 3);
        std::fs::remove_file(dir.join("Rivendell.md")).unwrap();
        rebuild(&conn, &dir).unwrap();
        assert_eq!(find("Aragorn.md", "Rivendell").link_text, "Rivendell"); // stale local copy
        let links = all_links(&conn).unwrap();
        assert_eq!(links.len(), 2);
        assert!(links.iter().all(|l| l.source_path == "Aragorn.md"));
        assert_eq!(unresolved_count(&conn).unwrap(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn heading_links_need_anchor() {
        let dir = tmp_vault("heading");
        write(&dir, "A.md", "[[B#Real]] and [[B#Fake]]\n");
        write(&dir, "B.md", "## Real\ntext\n");
        let conn = open_index(&dir).unwrap();
        rebuild(&conn, &dir).unwrap();
        let links = all_links(&conn).unwrap();
        let real = links.iter().find(|l| l.link_text == "B#Real").unwrap();
        let fake = links.iter().find(|l| l.link_text == "B#Fake").unwrap();
        assert_eq!(real.target_path.as_deref(), Some("B.md"));
        assert_eq!(fake.target_path, None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn search_and_tags() {
        let dir = tmp_vault("search");
        write(&dir, "Rivendell.md", "---\nkind: place\nsummary: Elf haven.\ntags: [Location/City]\n---\nThe hidden valley of the elves.\n");
        write(&dir, "Moria.md", "---\ntags: [Location/Dungeon]\n---\nDark dwarven halls.\n");
        let conn = open_index(&dir).unwrap();
        rebuild(&conn, &dir).unwrap();
        let hits = search(&conn, "valley elv").unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "Rivendell.md");
        assert!(search(&conn, "\"weird:[query]").unwrap().is_empty()); // no syntax error
        let tags = tag_counts(&conn).unwrap();
        assert_eq!(tags.len(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn collision_prefers_shortest_path() {
        let dir = tmp_vault("collision");
        write(&dir, "Gil.md", "x\n");
        write(&dir, "Deep/Nested/Gil.md", "y\n");
        write(&dir, "Ref.md", "[[Gil]]\n");
        let conn = open_index(&dir).unwrap();
        rebuild(&conn, &dir).unwrap();
        let links = all_links(&conn).unwrap();
        let l = links.iter().find(|l| l.link_text == "Gil").unwrap();
        assert_eq!(l.target_path.as_deref(), Some("Gil.md"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rewrite_preserves_heading_and_label() {
        let content = "See [[Aragorn]] and [[aragorn#Background|the king]], not [[Aragorn II]].\n";
        let out = rewrite_link_names(content, "Aragorn", "Elessar").unwrap();
        assert_eq!(out, "See [[Elessar]] and [[Elessar#Background|the king]], not [[Aragorn II]].\n");
        assert!(rewrite_link_names("no links here", "Aragorn", "Elessar").is_none());
        assert!(rewrite_link_names("[[Gandalf]]", "Aragorn", "Elessar").is_none());
    }

    #[test]
    fn schema_version_mismatch_recreates() {
        let dir = tmp_vault("version");
        write(&dir, "A.md", "hello\n");
        {
            let conn = open_index(&dir).unwrap();
            rebuild(&conn, &dir).unwrap();
            conn.execute("UPDATE index_meta SET value = '0' WHERE key = 'schema_version'", [])
                .unwrap();
        }
        let conn = open_index(&dir).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM pages", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0); // recreated empty
        rebuild(&conn, &dir).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM pages", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        std::fs::remove_dir_all(&dir).ok();
    }
}
