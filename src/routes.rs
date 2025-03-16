use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use rocksdb::Direction;
use serde::Deserialize;

use crate::db::{BlockRow, Database};

#[derive(Clone)]
pub struct App {
    pub db: Database,
}

pub fn router(state: App) -> Router {
    Router::new()
        .route("/block/{height}", get(block))
        .route("/blocks", get(blocks))
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

#[derive(Deserialize)]
struct Pagination {
    start: Option<u32>,
    end: Option<u32>,
    #[serde(default)]
    reverse: bool,
}

async fn blocks(
    State(app): State<App>,
    Query(pagination): Query<Pagination>,
) -> Result<Json<Vec<BlockRow>>, StatusCode> {
    let start = pagination.start.unwrap_or(0);
    let end = pagination.end.unwrap_or(start + 50);

    let blocks = app
        .db
        .blocks_range(
            start,
            end,
            if pagination.reverse {
                Direction::Reverse
            } else {
                Direction::Forward
            },
        )
        .unwrap();

    Ok(Json(blocks))
}
