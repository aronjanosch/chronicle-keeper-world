//! Index-backed endpoints: link graph (backlinks panel + diagnostics),
//! full-text search, page tags. All read the per-world `.ck/index.db` cache.

use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppResult;
use crate::state::AppState;
use crate::store::index;

use super::vault::vault_root;

/// Change counter for the vault — moves when files change outside CK
/// (Obsidian, Finder). The frontend polls this and refreshes on change.
pub async fn seq(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    Ok(Json(json!({ "seq": state.vault_seq(&root)? })))
}

pub async fn links(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    state.with_index(&root, |conn| {
        Ok(Json(json!({
            "links": index::all_links(conn)?,
            "unresolved": index::unresolved_count(conn)?,
            "orphans": index::orphan_count(conn)?,
        })))
    })?
}

/// Grouped vault diagnostics for the Explorer panel (Phase 3).
pub async fn diagnostics(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    state.with_index(&root, |conn| {
        Ok(Json(serde_json::to_value(index::diagnostics(conn, &root)?).unwrap()))
    })?
}

#[derive(Deserialize)]
pub struct SearchQuery {
    #[serde(default)]
    pub q: String,
    pub kind: Option<String>,
    pub tag: Option<String>,
    pub folder: Option<String>,
    pub edited_after: Option<i64>,
    pub edited_before: Option<i64>,
}

pub async fn search(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    let facets = index::SearchFacets {
        kind: query.kind.filter(|s| !s.is_empty()),
        tag: query.tag.filter(|s| !s.is_empty()),
        folder: query.folder.filter(|s| !s.is_empty()),
        edited_after: query.edited_after,
        edited_before: query.edited_before,
    };
    state.with_index(&root, |conn| {
        Ok(Json(json!({ "results": index::search_faceted(conn, &query.q, &facets)? })))
    })?
}

#[derive(Deserialize)]
pub struct SessionSearchQuery {
    #[serde(default)]
    pub q: String,
    /// "summaries" (default) or "transcripts".
    pub scope: Option<String>,
}

/// Full-text-ish search over session summaries / raw transcripts (Phase 7d).
/// These records are files, not in the page FTS index, so this is a substring
/// scan rather than a ranked query.
pub async fn session_search(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
    Query(query): Query<SessionSearchQuery>,
) -> AppResult<Json<Value>> {
    let (root, _) = super::vault::world_cfg(&state, &campaign_id)?;
    let hits = if query.scope.as_deref() == Some("transcripts") {
        crate::session_search::search_transcripts(&root, &query.q)
    } else {
        crate::session_search::search_summaries(&root, &query.q)
    };
    Ok(Json(json!({ "results": hits })))
}

pub async fn tags(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    state.with_index(&root, |conn| {
        let tags: Vec<Value> = index::tag_counts(conn)?
            .into_iter()
            .map(|(tag, count)| json!({ "tag": tag, "count": count }))
            .collect();
        Ok(Json(json!({ "tags": tags })))
    })?
}
