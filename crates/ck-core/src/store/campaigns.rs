use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::config::get_value;
use crate::error::{AppError, AppResult};
use crate::models::{CampaignDetail, CampaignInfo, CampaignUpdateRequest};
use crate::normalize::normalize_players;
use crate::store::now;

fn default_language(conn: &Connection) -> String {
    get_value(conn, "default_language")
        .ok()
        .flatten()
        .unwrap_or_else(|| "en".to_string())
}

fn row_to_detail(row: &rusqlite::Row, fallback_lang: &str) -> rusqlite::Result<CampaignDetail> {
    let players_json: String = row.get("players_json")?;
    let players = serde_json::from_str::<Value>(&players_json).unwrap_or_else(|_| json!([]));
    let lang: Option<String> = row.get("default_language")?;
    Ok(CampaignDetail {
        campaign_id: row.get("campaign_id")?,
        name: row.get("name")?,
        next_session_number: row.get("next_session_number")?,
        system: row.get::<_, Option<String>>("system")?.unwrap_or_default(),
        gm: row.get::<_, Option<String>>("gm")?.unwrap_or_default(),
        gm_pronouns: row
            .get::<_, Option<String>>("gm_pronouns")?
            .unwrap_or_default(),
        setting: row.get::<_, Option<String>>("setting")?.unwrap_or_default(),
        default_language: lang
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| fallback_lang.to_string()),
        players: normalize_players(&players),
        extra_info: row
            .get::<_, Option<String>>("extra_info")?
            .unwrap_or_default(),
        codex: row.get::<_, Option<String>>("codex")?.unwrap_or_default(),
        codex_notes: row
            .get::<_, Option<String>>("codex_notes")?
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .filter(Value::is_array)
            .unwrap_or_else(|| json!([])),
        recap: row.get::<_, Option<String>>("recap")?.unwrap_or_default(),
        recap_updated_at: row
            .get::<_, Option<String>>("recap_updated_at")?
            .unwrap_or_default(),
        vault_path: row
            .get::<_, Option<String>>("vault_path")?
            .filter(|s| !s.is_empty()),
    })
}

/// Provision the canonical 1.0 world layout for a campaign. Creates
/// `Codex/`, `Sessions/`, `.ck/` under the world root and stores
/// `<world_root>/Codex` as the campaign's `vault_path`.
///
/// `world_path`: caller-supplied world root folder (from the New-World screen).
/// `None` or empty → compute `<data-root>/<safe-name>/`.
/// Best-effort from the HTTP handler — a filesystem error must not block creation.
pub fn provision_vault(
    conn: &Connection,
    campaign_id: &str,
    campaign_name: &str,
    world_path: Option<&str>,
    scaffold: bool,
) -> AppResult<()> {
    let world_root = if let Some(p) = world_path.map(str::trim).filter(|s| !s.is_empty()) {
        std::path::PathBuf::from(p)
    } else {
        let root = crate::store::sessions::output_root(conn)?;
        if root.as_os_str().is_empty() {
            return Ok(());
        }
        root.join(crate::normalize::sanitize_folder_name(campaign_name))
    };
    crate::vault::provision_vault_layout(&world_root, scaffold)?;
    crate::vault::write_world_config(&world_root, campaign_id, campaign_name)?;
    let codex = world_root.join("Codex");
    set_vault_path(conn, campaign_id, Some(&codex.to_string_lossy()))?;
    Ok(())
}

pub fn set_vault_path(conn: &Connection, campaign_id: &str, path: Option<&str>) -> AppResult<()> {
    let n = conn.execute(
        "UPDATE campaigns SET vault_path = ?1 WHERE campaign_id = ?2",
        params![path, campaign_id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!(
            "Campaign not found: {campaign_id}"
        )));
    }
    Ok(())
}

/// Store a freshly generated recap, stamping `recap_updated_at`.
pub fn set_recap(conn: &Connection, campaign_id: &str, recap: &str) -> AppResult<String> {
    let ts = now();
    conn.execute(
        "UPDATE campaigns SET recap = ?1, recap_updated_at = ?2 WHERE campaign_id = ?3",
        params![recap, ts, campaign_id],
    )?;
    Ok(ts)
}

/// Effective freeform text fed to every summary: the `codex_notes` list joined
/// (title then body, blank-line separated), falling back to the legacy single
/// `codex` string when no notes exist yet.
pub fn codex_freeform_text(detail: &CampaignDetail) -> String {
    if let Some(arr) = detail.codex_notes.as_array() {
        let mut parts = Vec::new();
        for n in arr {
            let title = n.get("title").and_then(Value::as_str).unwrap_or("").trim();
            let body = n.get("body").and_then(Value::as_str).unwrap_or("").trim();
            if title.is_empty() && body.is_empty() {
                continue;
            }
            parts.push(if title.is_empty() {
                body.to_string()
            } else {
                format!("{title}\n{body}")
            });
        }
        if !parts.is_empty() {
            return parts.join("\n\n");
        }
    }
    detail.codex.trim().to_string()
}

pub fn get_campaigns(conn: &Connection) -> AppResult<Vec<CampaignDetail>> {
    let lang = default_language(conn);
    let mut stmt = conn.prepare("SELECT * FROM campaigns ORDER BY name")?;
    let mut out = stmt
        .query_map([], |r| row_to_detail(r, &lang))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    for d in &mut out {
        d.next_session_number = next_session_number(conn, Some(&d.campaign_id))?;
    }
    Ok(out)
}

pub fn get_campaign(conn: &Connection, campaign_id: &str) -> AppResult<Option<CampaignDetail>> {
    let lang = default_language(conn);
    let c = conn
        .query_row(
            "SELECT * FROM campaigns WHERE campaign_id = ?1",
            params![campaign_id],
            |r| row_to_detail(r, &lang),
        )
        .optional()?;
    Ok(match c {
        Some(mut d) => {
            d.next_session_number = next_session_number(conn, Some(&d.campaign_id))?;
            Some(d)
        }
        None => None,
    })
}

pub fn campaign_infos(conn: &Connection) -> AppResult<Vec<CampaignInfo>> {
    Ok(get_campaigns(conn)?
        .into_iter()
        .map(|c| CampaignInfo {
            campaign_id: c.campaign_id,
            name: c.name,
            next_session_number: c.next_session_number,
        })
        .collect())
}

pub fn create_campaign(
    conn: &Connection,
    campaign_id: &str,
    name: &str,
    start_session_number: i64,
) -> AppResult<CampaignDetail> {
    if let Some(existing) = get_campaign(conn, campaign_id)? {
        return Ok(existing);
    }
    let lang = default_language(conn);
    conn.execute(
        "INSERT INTO campaigns \
         (campaign_id, name, next_session_number, system, gm, setting, default_language, players_json, extra_info) \
         VALUES (?1, ?2, ?3, '', '', '', ?4, '[]', '')",
        params![campaign_id, name, start_session_number, lang],
    )?;
    set_current_campaign_id(conn, campaign_id)?;
    get_campaign(conn, campaign_id)?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("campaign vanished")))
}

pub fn update_campaign(
    conn: &Connection,
    campaign_id: &str,
    req: &CampaignUpdateRequest,
) -> AppResult<CampaignDetail> {
    if get_campaign(conn, campaign_id)?.is_none() {
        return Err(AppError::NotFound(format!(
            "Campaign not found: {campaign_id}"
        )));
    }
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    macro_rules! push_str {
        ($field:literal, $opt:expr) => {
            if let Some(v) = &$opt {
                sets.push(format!("{} = ?", $field));
                vals.push(Box::new(v.clone()));
            }
        };
    }
    push_str!("name", req.name);
    push_str!("system", req.system);
    push_str!("gm", req.gm);
    push_str!("gm_pronouns", req.gm_pronouns);
    push_str!("setting", req.setting);
    push_str!("default_language", req.default_language);
    push_str!("extra_info", req.extra_info);
    push_str!("codex", req.codex);
    if let Some(notes) = &req.codex_notes {
        sets.push("codex_notes = ?".into());
        vals.push(Box::new(notes.to_string()));
    }
    if let Some(n) = req.next_session_number {
        sets.push("next_session_number = ?".into());
        vals.push(Box::new(n));
    }
    // Normalize once; reused below for the players_json column and codex PC sync.
    let normalized_players = req.players.as_ref().map(normalize_players);
    if let Some(players) = &normalized_players {
        sets.push("players_json = ?".into());
        vals.push(Box::new(players.to_string()));
    }
    if sets.is_empty() {
        return get_campaign(conn, campaign_id)?
            .ok_or_else(|| AppError::NotFound(format!("Campaign not found: {campaign_id}")));
    }
    vals.push(Box::new(campaign_id.to_string()));
    let sql = format!(
        "UPDATE campaigns SET {} WHERE campaign_id = ?",
        sets.join(", ")
    );
    let refs: Vec<&dyn rusqlite::ToSql> = vals.iter().map(|b| b.as_ref()).collect();
    conn.execute(&sql, refs.as_slice())?;
    // Keep the codex in sync with the party roster: each character gets an empty
    // `pc` entry (create-only — see codex::sync_pc_entries).
    if let Some(players) = &normalized_players {
        crate::store::codex::sync_pc_entries(conn, campaign_id, players)?;
    }
    get_campaign(conn, campaign_id)?
        .ok_or_else(|| AppError::NotFound(format!("Campaign not found: {campaign_id}")))
}

/// Delete a campaign and cascade to all its sessions (artifacts + audio dirs
/// included).
pub fn delete_campaign(conn: &Connection, campaign_id: &str) -> AppResult<()> {
    if get_campaign(conn, campaign_id)?.is_none() {
        return Err(AppError::NotFound(format!(
            "Campaign not found: {campaign_id}"
        )));
    }
    let mut stmt = conn.prepare("SELECT session_id FROM sessions WHERE campaign_id = ?1")?;
    let session_ids: Vec<String> = stmt
        .query_map(params![campaign_id], |r| r.get::<_, String>(0))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);
    for sid in &session_ids {
        crate::store::sessions::delete_session(conn, sid)?;
    }
    conn.execute(
        "DELETE FROM codex_entries WHERE campaign_id = ?1",
        params![campaign_id],
    )?;
    conn.execute(
        "DELETE FROM campaigns WHERE campaign_id = ?1",
        params![campaign_id],
    )?;
    // Drop the dangling "current campaign" pointer if it named this one.
    if current_campaign_id(conn)?.as_deref() == Some(campaign_id) {
        set_current_campaign_id(conn, "")?;
    }
    Ok(())
}

/// Next free session number. Derived from the live sessions (`MAX + 1`) so it
/// can't drift; only when a campaign has no sessions yet do we fall back to its
/// configured start value in `next_session_number`.
pub fn next_session_number(conn: &Connection, campaign_id: Option<&str>) -> AppResult<i64> {
    let target = match campaign_id {
        Some(id) if !id.is_empty() => Some(id.to_string()),
        _ => current_campaign_id(conn)?,
    };
    let Some(target) = target else { return Ok(1) };
    let max_used: Option<i64> = conn.query_row(
        "SELECT MAX(session_number) FROM sessions WHERE campaign_id = ?1",
        params![target],
        |r| r.get(0),
    )?;
    if let Some(m) = max_used {
        return Ok(m + 1);
    }
    let start: Option<i64> = conn
        .query_row(
            "SELECT next_session_number FROM campaigns WHERE campaign_id = ?1",
            params![target],
            |r| r.get(0),
        )
        .optional()?;
    Ok(start.unwrap_or(1))
}

pub fn current_campaign_id(conn: &Connection) -> AppResult<Option<String>> {
    let v: Option<String> = conn
        .query_row(
            "SELECT value FROM config WHERE key = 'current_campaign_id'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    Ok(v.filter(|s| !s.is_empty()))
}

pub fn set_current_campaign_id(conn: &Connection, campaign_id: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO config (key, value) VALUES ('current_campaign_id', ?1) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![campaign_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provision_vault_creates_canonical_layout() {
        let conn = crate::db::open_in_memory().unwrap();
        let tmp = std::env::temp_dir().join(format!("ck-pv-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        crate::config::set_value(&conn, "output_root", &tmp.to_string_lossy()).unwrap();
        create_campaign(&conn, "c1", "My World", 1).unwrap();

        provision_vault(&conn, "c1", "My World", None, false).unwrap();
        let vp = get_campaign(&conn, "c1").unwrap().unwrap().vault_path.unwrap();
        let vault = std::path::Path::new(&vp);
        assert!(vault.ends_with("Codex"), "vault_path should point to Codex/");
        assert!(vault.is_dir());
        assert!(vault.parent().unwrap().join("Sessions").is_dir());
        assert!(vault.parent().unwrap().join(".ck").is_dir());
        assert_eq!(crate::vault::list_pages(vault).unwrap().len(), 0, "starts empty");

        // Idempotent
        provision_vault(&conn, "c1", "My World", None, false).unwrap();
        assert_eq!(crate::vault::list_pages(vault).unwrap().len(), 0);

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn provision_vault_scaffold_creates_subfolders() {
        let conn = crate::db::open_in_memory().unwrap();
        let tmp = std::env::temp_dir().join(format!("ck-pvs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        crate::config::set_value(&conn, "output_root", &tmp.to_string_lossy()).unwrap();
        create_campaign(&conn, "c2", "Scaffold World", 1).unwrap();
        provision_vault(&conn, "c2", "Scaffold World", None, true).unwrap();
        let vp = get_campaign(&conn, "c2").unwrap().unwrap().vault_path.unwrap();
        let vault = std::path::Path::new(&vp);
        assert!(vault.join("NPCs").is_dir());
        assert!(vault.join("Places").is_dir());
        std::fs::remove_dir_all(&tmp).ok();
    }
}
