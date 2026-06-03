use axum::extract::State;
use axum::Json;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::store::migration;

pub async fn status(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let legacy = state.paths.legacy_db_path();
    let s = state.with_db(|conn| migration::status(conn, &legacy))?;
    Ok(Json(serde_json::to_value(s).unwrap()))
}

pub async fn run(State(state): State<AppState>) -> AppResult<Json<Value>> {
    // Audio copy can take a while — keep it off the async runtime threads.
    let result = tokio::task::spawn_blocking(move || {
        let legacy = state.paths.legacy_db_path();
        state.with_db(|conn| migration::run_all(conn, &legacy))
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!("migration task: {e}")))??;
    Ok(Json(serde_json::to_value(result).unwrap()))
}
