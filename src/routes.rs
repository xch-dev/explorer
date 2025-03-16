use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};

use crate::db::{BlockRow, Database};

#[derive(Clone)]
pub struct App {
    pub db: Database,
}

pub fn router(state: App) -> Router {
    Router::new()
        .route("/block/{height}", get(block))
        .with_state(state)
}

async fn block(
    State(app): State<App>,
    Path(height): Path<u32>,
) -> Result<Json<BlockRow>, StatusCode> {
    let Some(block) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };
    Ok(Json(block))
}
