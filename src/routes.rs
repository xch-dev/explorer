use axum::{
    extract::{Path, Query, State},
    http::{Method, StatusCode},
    routing::get,
    Json, Router,
};
use rocksdb::Direction;
use serde::Deserialize;
use tower_http::cors::{Any, CorsLayer};

use crate::db::{BlockRow, Database};

#[derive(Clone)]
pub struct App {
    pub db: Database,
}

pub fn router(state: App) -> Router {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST])
        .allow_origin(Any);

    Router::new()
        .route("/block/{height}", get(block))
        .route("/blocks", get(blocks))
        .with_state(state)
        .layer(cors)
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
    let (start, end) = if pagination.reverse {
        let end = pagination
            .end
            .unwrap_or(app.db.peak_height().unwrap().unwrap_or(0));
        let start = pagination.start.unwrap_or(end.saturating_sub(50));
        (start, end)
    } else {
        let start = pagination.start.unwrap_or(0);
        let end = pagination.end.unwrap_or(start + 50);
        (start, end)
    };

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
