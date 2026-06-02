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

pub async fn list_tree(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    Ok(Json(json!({
        "folders": vault::list_folders(&root)?,
        "pages": vault::list_pages(&root)?,
    })))
}

#[derive(Deserialize)]
pub struct FolderRequest {
    pub path: String,
}

pub async fn create_folder(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
    Json(req): Json<FolderRequest>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    vault::create_folder(&root, &req.path)?;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct MoveRequest {
    pub from: String,
    pub to: String,
}

pub async fn move_entry(
    State(state): State<AppState>,
    Path(campaign_id): Path<String>,
    Json(req): Json<MoveRequest>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    vault::move_entry(&root, &req.from, &req.to)?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn delete_page(
    State(state): State<AppState>,
    Path((campaign_id, page)): Path<(String, String)>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    vault::delete_page(&root, &page)?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn delete_folder(
    State(state): State<AppState>,
    Path((campaign_id, folder)): Path<(String, String)>,
) -> AppResult<Json<Value>> {
    let root = vault_root(&state, &campaign_id)?;
    vault::delete_folder(&root, &folder)?;
    Ok(Json(json!({ "ok": true })))
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
    #[serde(default)]
    pub folder: Option<String>,
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
    Ok(Json(vault::create_page(
        &root,
        &req.title,
        &req.kind,
        req.folder.as_deref(),
    )?))
}
