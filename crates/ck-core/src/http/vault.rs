//! Vault page endpoints (files-as-truth).

use std::path::PathBuf;

use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::store::campaigns;
use crate::vault;

fn vault_root(state: &AppState, campaign_id: &str) -> AppResult<PathBuf> {
    let path = state.with_db(|conn| campaigns::get_campaign(conn, campaign_id))?
        .ok_or_else(|| AppError::NotFound(format!("Campaign not found: {campaign_id}")))?
        .vault_path;
    match path {
        Some(p) => Ok(PathBuf::from(p)),
        None => Err(AppError::BadRequest(
            "This campaign has no vault folder attached".into(),
        )),
    }
}

#[derive(Deserialize)]
pub struct AttachRequest {
    pub path: Option<String>,
}

pub async fn attach(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
    Json(req): Json<AttachRequest>,
) -> AppResult<Json<Value>> {
    let path = req.path.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if let Some(p) = path {
        vault::ensure_ck_dir(std::path::Path::new(p))?;
    }
    let campaign = state.with_db(|conn| {
        campaigns::set_vault_path(conn, &campaign_id, path)?;
        campaigns::get_campaign(conn, &campaign_id)
    })?
    .ok_or_else(|| AppError::NotFound(format!("Campaign not found: {campaign_id}")))?;
    Ok(Json(serde_json::to_value(campaign).unwrap()))
}

pub async fn list_pages(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    Ok(Json(json!({ "pages": vault::list_pages(&root)? })))
}

pub async fn read_page(
    State(state): State<AppState>,
    Path((campaign_id, page)): Path<(String, String)>,
) -> AppResult<Json<vault::Page>> {
    let root = vault_root(&state, &campaign_id)?;
    Ok(Json(vault::read_page(&root, &page)?))
}

#[derive(Deserialize)]
pub struct WriteRequest {
    pub content: String,
}

pub async fn write_page(
    State(state): State<AppState>,
    Path((campaign_id, page)): Path<(String, String)>,
    Json(req): Json<WriteRequest>,
) -> AppResult<Json<vault::Page>> {
    let root = vault_root(&state, &campaign_id)?;
    Ok(Json(vault::write_page(&root, &page, &req.content)?))
}

#[derive(Deserialize)]
pub struct CreateRequest {
    pub title: String,
    #[serde(default = "default_kind")]
    pub kind: String,
}

fn default_kind() -> String {
    "lore".into()
}

pub async fn create_page(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
    Json(req): Json<CreateRequest>,
) -> AppResult<Json<vault::Page>> {
    let root = vault_root(&state, &campaign_id)?;
    Ok(Json(vault::create_page(&root, &req.title, &req.kind)?))
}
