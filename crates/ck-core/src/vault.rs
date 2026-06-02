//! Vault pages: a folder of `.md` files, files-as-truth. Direct file I/O.

use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize)]
pub struct PageInfo {
    pub path: String,
    pub title: String,
    pub kind: Option<String>,
    pub summary: String,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct Page {
    pub path: String,
    pub title: String,
    pub kind: Option<String>,
    pub summary: String,
    pub content: String,
}

fn require_dir(vault: &Path) -> AppResult<()> {
    if vault.is_dir() {
        Ok(())
    } else {
        Err(AppError::BadRequest(format!(
            "Vault folder does not exist: {}",
            vault.display()
        )))
    }
}

// Rejects `..`, absolute paths, and empty/dotfile components — result stays
// under `vault`. Used for folders and move targets (no extension requirement).
fn resolve_rel(vault: &Path, rel: &str) -> AppResult<PathBuf> {
    let candidate = Path::new(rel);
    let mut any = false;
    for comp in candidate.components() {
        match comp {
            Component::Normal(s) => {
                any = true;
                if s.to_string_lossy().starts_with('.') {
                    return Err(AppError::BadRequest("invalid path".into()));
                }
            }
            _ => return Err(AppError::BadRequest("invalid path".into())),
        }
    }
    if !any {
        return Err(AppError::BadRequest("empty path".into()));
    }
    Ok(vault.join(candidate))
}

// As `resolve_rel`, but also requires a `.md` extension (page files).
fn resolve(vault: &Path, rel: &str) -> AppResult<PathBuf> {
    if Path::new(rel).extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(AppError::BadRequest("page path must end in .md".into()));
    }
    resolve_rel(vault, rel)
}

fn rel_of(vault: &Path, abs: &Path) -> String {
    abs.strip_prefix(vault)
        .unwrap_or(abs)
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

// Flat-scalar YAML only; list/nested lines are skipped.
fn split_frontmatter(content: &str) -> (Vec<(String, String)>, &str) {
    let rest = match content.strip_prefix("---\n").or_else(|| content.strip_prefix("---\r\n")) {
        Some(r) => r,
        None => return (Vec::new(), content),
    };
    let Some(end) = rest.find("\n---") else {
        return (Vec::new(), content);
    };
    let fm = &rest[..end];
    let body = rest[end + 4..].trim_start_matches(['\r', '\n']);
    let mut map = Vec::new();
    for line in fm.lines() {
        if line.starts_with([' ', '\t', '-']) || line.trim().is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            let v = v.trim().trim_matches(['"', '\'']).to_string();
            map.push((k.trim().to_string(), v));
        }
    }
    (map, body)
}

fn first_paragraph(body: &str) -> String {
    body.split("\n\n")
        .map(str::trim)
        .find(|p| !p.is_empty() && !p.starts_with('#'))
        .unwrap_or("")
        .replace('\n', " ")
        .trim()
        .chars()
        .take(200)
        .collect()
}

fn title_of(abs: &Path) -> String {
    abs.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

fn page_from(vault: &Path, abs: &Path, content: String) -> Page {
    let (fm, body) = split_frontmatter(&content);
    let get = |key: &str| fm.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
    let summary = get("summary")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| first_paragraph(body));
    Page {
        path: rel_of(vault, abs),
        title: title_of(abs),
        kind: get("kind").filter(|s| !s.is_empty()),
        summary,
        content,
    }
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
            collect_md(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(path);
        }
    }
}

fn mtime_secs(abs: &Path) -> Option<u64> {
    abs.metadata()
        .and_then(|m| m.modified())
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}

fn collect_dirs(base: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        out.push(rel_of(base, &path));
        collect_dirs(base, &path, out);
    }
}

// Every folder under the vault (incl. empty ones), as slash-joined relative
// paths. Excludes `.ck` and other dotfiles. Sorted.
pub fn list_folders(vault: &Path) -> AppResult<Vec<String>> {
    require_dir(vault)?;
    let mut dirs = Vec::new();
    collect_dirs(vault, vault, &mut dirs);
    dirs.sort();
    Ok(dirs)
}

pub fn create_folder(vault: &Path, rel: &str) -> AppResult<()> {
    require_dir(vault)?;
    let abs = resolve_rel(vault, rel)?;
    if abs.is_file() {
        return Err(AppError::BadRequest("A file with that name exists".into()));
    }
    std::fs::create_dir_all(&abs)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("create folder: {e}")))
}

// Rename or move a page or folder. `from` must exist; `to` must not.
pub fn move_entry(vault: &Path, from: &str, to: &str) -> AppResult<()> {
    require_dir(vault)?;
    let src = resolve_rel(vault, from)?;
    let dst = resolve_rel(vault, to)?;
    if !src.exists() {
        return Err(AppError::NotFound(format!("Not found: {from}")));
    }
    if dst.exists() {
        return Err(AppError::BadRequest(format!("Already exists: {to}")));
    }
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("create dir: {e}")))?;
    }
    std::fs::rename(&src, &dst)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("move: {e}")))
}

pub fn delete_page(vault: &Path, rel: &str) -> AppResult<()> {
    let abs = resolve(vault, rel)?;
    if !abs.is_file() {
        return Err(AppError::NotFound(format!("Page not found: {rel}")));
    }
    std::fs::remove_file(&abs)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("delete page: {e}")))
}

// Removes an empty folder. `remove_dir` fails on a non-empty dir, which is the
// guard we want — deleting a folder full of pages is not a Part 2 action.
pub fn delete_folder(vault: &Path, rel: &str) -> AppResult<()> {
    let abs = resolve_rel(vault, rel)?;
    if !abs.is_dir() {
        return Err(AppError::NotFound(format!("Folder not found: {rel}")));
    }
    std::fs::remove_dir(&abs).map_err(|_| {
        AppError::BadRequest("Folder isn't empty — move or delete its pages first".into())
    })
}

pub fn ensure_ck_dir(vault: &Path) -> AppResult<()> {
    require_dir(vault)?;
    let ck = vault.join(".ck");
    std::fs::create_dir_all(&ck)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("create .ck: {e}")))?;
    let gitignore = ck.join(".gitignore");
    if !gitignore.exists() {
        let _ = std::fs::write(&gitignore, "index.db\nindex.db-*\n");
    }
    Ok(())
}

pub fn list_pages(vault: &Path) -> AppResult<Vec<PageInfo>> {
    require_dir(vault)?;
    let mut files = Vec::new();
    collect_md(vault, &mut files);
    let mut pages: Vec<PageInfo> = files
        .iter()
        .filter_map(|abs| {
            let content = std::fs::read_to_string(abs).ok()?;
            let p = page_from(vault, abs, content);
            Some(PageInfo {
                path: p.path,
                title: p.title,
                kind: p.kind,
                summary: p.summary,
                modified: mtime_secs(abs),
            })
        })
        .collect();
    pages.sort_by_key(|p| p.title.to_lowercase());
    Ok(pages)
}

pub fn read_page(vault: &Path, rel: &str) -> AppResult<Page> {
    let abs = resolve(vault, rel)?;
    let content = std::fs::read_to_string(&abs)
        .map_err(|_| AppError::NotFound(format!("Page not found: {rel}")))?;
    Ok(page_from(vault, &abs, content))
}

pub fn write_page(vault: &Path, rel: &str, content: &str) -> AppResult<Page> {
    let abs = resolve(vault, rel)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("create dir: {e}")))?;
    }
    std::fs::write(&abs, content)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("write page: {e}")))?;
    Ok(page_from(vault, &abs, content.to_string()))
}

pub fn create_page(vault: &Path, title: &str, kind: &str, folder: Option<&str>) -> AppResult<Page> {
    require_dir(vault)?;
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("title is required".into()));
    }
    if title.contains(['/', '\\']) {
        return Err(AppError::BadRequest("title cannot contain slashes".into()));
    }
    let folder = folder.map(str::trim).filter(|s| !s.is_empty());
    let rel = match folder {
        Some(f) => format!("{f}/{title}.md"),
        None => format!("{title}.md"),
    };
    let abs = resolve(vault, &rel)?;
    if abs.exists() {
        return Err(AppError::BadRequest(format!(
            "A page named \"{title}\" already exists here"
        )));
    }
    write_page(vault, &rel, &page_file_content(title, kind, "", ""))
}

pub fn default_vault_path(output_root: &Path, campaign_name: &str) -> PathBuf {
    output_root
        .join(crate::normalize::sanitize_folder_name(campaign_name))
        .join("world")
}

pub fn has_pages(vault: &Path) -> bool {
    let mut files = Vec::new();
    collect_md(vault, &mut files);
    !files.is_empty()
}

pub fn page_exists(vault: &Path, title: &str) -> bool {
    let want = title.trim().to_lowercase();
    let mut files = Vec::new();
    collect_md(vault, &mut files);
    files
        .iter()
        .filter_map(|p| p.file_stem().and_then(|s| s.to_str()))
        .any(|s| s.to_lowercase() == want)
}

// Filesystem-safe filename; spaces kept (Obsidian-style), separators stripped.
fn safe_page_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim();
    if cleaned.is_empty() {
        "Untitled".into()
    } else {
        cleaned.to_string()
    }
}

fn yaml_scalar(s: &str) -> String {
    let s = s.trim();
    if s.is_empty() {
        return String::new();
    }
    let needs_quote = s.contains([':', '#', '"', '\''])
        || s.starts_with(['-', ' ', '[', '{', '*', '&', '!', '|', '>', '@', '`'])
        || s.ends_with(' ');
    if needs_quote {
        format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        s.to_string()
    }
}

fn page_file_content(name: &str, kind: &str, summary: &str, body: &str) -> String {
    let mut out = format!("---\nkind: {kind}\n");
    let s = yaml_scalar(summary);
    if s.is_empty() {
        out.push_str("summary:\n");
    } else {
        out.push_str(&format!("summary: {s}\n"));
    }
    out.push_str(&format!("---\n\n# {name}\n\n"));
    let body = body.trim();
    if !body.is_empty() {
        out.push_str(body);
        out.push('\n');
    }
    out
}

fn unique_md_path(vault: &Path, stem: &str) -> PathBuf {
    let mut candidate = vault.join(format!("{stem}.md"));
    let mut n = 2;
    while candidate.exists() {
        candidate = vault.join(format!("{stem}-{n}.md"));
        n += 1;
    }
    candidate
}

// One-time migration: write a codex entry as a page (body one-liner → summary,
// detail → page body). Best-effort; collisions get a numeric suffix.
pub fn write_migrated_entry(
    vault: &Path,
    name: &str,
    kind: &str,
    summary: &str,
    body: &str,
) -> std::io::Result<()> {
    let path = unique_md_path(vault, &safe_page_filename(name));
    std::fs::write(path, page_file_content(name, kind, summary, body))
}

// Stub page for an auto-extracted name. No-op if a page of that title exists.
pub fn create_stub(vault: &Path, name: &str, kind: &str) -> bool {
    let name = name.trim();
    if name.is_empty() || !crate::store::codex::KINDS.contains(&kind) || page_exists(vault, name) {
        return false;
    }
    let path = unique_md_path(vault, &safe_page_filename(name));
    std::fs::write(path, page_file_content(name, kind, "", "")).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rejects_traversal() {
        let v = Path::new("/tmp/vault");
        assert!(resolve(v, "../escape.md").is_err());
        assert!(resolve(v, "/etc/passwd.md").is_err());
        assert!(resolve(v, "a/../../b.md").is_err());
        assert!(resolve(v, "notes.txt").is_err());
        assert_eq!(resolve(v, "Characters/Aragorn.md").unwrap(), v.join("Characters/Aragorn.md"));
    }

    #[test]
    fn frontmatter_split_and_summary() {
        let raw = "---\nkind: npc\nsummary: A ranger.\naliases:\n  - Strider\n---\n\n# Aragorn\n\nBody text.";
        let (fm, body) = split_frontmatter(raw);
        assert_eq!(fm.iter().find(|(k, _)| k == "kind").unwrap().1, "npc");
        assert_eq!(fm.iter().find(|(k, _)| k == "summary").unwrap().1, "A ranger.");
        assert!(body.starts_with("# Aragorn"));
    }

    #[test]
    fn summary_falls_back_to_first_paragraph() {
        let raw = "---\nkind: lore\n---\n\n# Title\n\nFirst real paragraph here.\n\nSecond.";
        let (_, body) = split_frontmatter(raw);
        assert_eq!(first_paragraph(body), "First real paragraph here.");
    }

    #[test]
    fn page_roundtrip() {
        let dir = std::env::temp_dir().join(format!("ck-vault-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let created = create_page(&dir, "Rivendell", "place", None).unwrap();
        assert_eq!(created.path, "Rivendell.md");
        assert_eq!(created.kind.as_deref(), Some("place"));
        assert!(create_page(&dir, "Rivendell", "place", None).is_err());
        write_page(&dir, "Rivendell.md", "---\nkind: place\nsummary: Elf haven.\n---\n\nBody").unwrap();
        let read = read_page(&dir, "Rivendell.md").unwrap();
        assert_eq!(read.summary, "Elf haven.");
        assert_eq!(list_pages(&dir).unwrap().len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    fn tmp_vault(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ck-vault-{tag}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn folders_create_list_and_nested_page() {
        let dir = tmp_vault("folders");
        create_folder(&dir, "NPCs/Neverwinter").unwrap();
        let folders = list_folders(&dir).unwrap();
        assert!(folders.contains(&"NPCs".to_string()));
        assert!(folders.contains(&"NPCs/Neverwinter".to_string()));

        let page = create_page(&dir, "Lord Ulric", "npc", Some("NPCs/Neverwinter")).unwrap();
        assert_eq!(page.path, "NPCs/Neverwinter/Lord Ulric.md");
        assert_eq!(list_pages(&dir).unwrap().len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn move_file_and_folder() {
        let dir = tmp_vault("move");
        create_page(&dir, "Aragorn", "npc", None).unwrap();
        // rename a page
        move_entry(&dir, "Aragorn.md", "Strider.md").unwrap();
        assert!(read_page(&dir, "Aragorn.md").is_err());
        assert!(read_page(&dir, "Strider.md").is_ok());
        // moving onto an existing path fails
        create_page(&dir, "Gandalf", "npc", None).unwrap();
        assert!(move_entry(&dir, "Strider.md", "Gandalf.md").is_err());
        // move a folder with children
        create_folder(&dir, "Old").unwrap();
        create_page(&dir, "Note", "lore", Some("Old")).unwrap();
        move_entry(&dir, "Old", "New").unwrap();
        assert!(read_page(&dir, "New/Note.md").is_ok());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_and_traversal_guards() {
        let dir = tmp_vault("delete");
        create_page(&dir, "Doomed", "lore", None).unwrap();
        delete_page(&dir, "Doomed.md").unwrap();
        assert!(read_page(&dir, "Doomed.md").is_err());
        assert!(delete_page(&dir, "Doomed.md").is_err());
        // folder + move resolvers reject traversal / dotfiles
        assert!(create_folder(&dir, "../escape").is_err());
        assert!(create_folder(&dir, ".ck").is_err());
        assert!(move_entry(&dir, "a.md", "../b.md").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
