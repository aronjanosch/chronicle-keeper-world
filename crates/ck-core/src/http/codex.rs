//! Codex entry endpoints (Phase 2). Pattern mirrors `campaigns.rs`.

use axum::extract::{Path, State};
use axum::Json;

use crate::error::AppResult;
use crate::models::{CodexEntry, CodexEntryCreate, CodexEntryUpdate};
use crate::state::AppState;
use crate::store::codex;

pub async fn list(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
) -> AppResult<Json<Vec<CodexEntry>>> {
    state.with_db(|conn| Ok(Json(codex::list_entries(conn, &campaign_id)?)))
}

pub async fn create(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
    Json(req): Json<CodexEntryCreate>,
) -> AppResult<Json<CodexEntry>> {
    state.with_db(|conn| Ok(Json(codex::create_entry(conn, &campaign_id, &req)?)))
}

pub async fn update(
    State(state): State<AppState>,
    Path((_campaign_id, entry_id)): Path<(String, String)>,
    Json(req): Json<CodexEntryUpdate>,
) -> AppResult<Json<CodexEntry>> {
    state.with_db(|conn| Ok(Json(codex::update_entry(conn, &entry_id, &req)?)))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((_campaign_id, entry_id)): Path<(String, String)>,
) -> AppResult<Json<serde_json::Value>> {
    state.with_db(|conn| {
        codex::delete_entry(conn, &entry_id)?;
        Ok(Json(serde_json::json!({ "status": "ok" })))
    })
}
