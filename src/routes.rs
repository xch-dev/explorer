use std::collections::HashSet;

use axum::{
    extract::{Path, Query, State},
    http::{Method, StatusCode},
    routing::get,
    Json, Router,
};
use chia::protocol::Bytes32;
use itertools::Itertools;
use rocksdb::Direction;
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

use crate::db::{BlockRow, CoinRow, Database};

#[derive(Clone)]
pub struct App {
    pub db: Database,
}

pub fn router(app: App) -> Router {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST])
        .allow_origin(Any);

    Router::new()
        .route("/state", get(state))
        .route("/blocks/latest", get(latest_block))
        .route("/blocks/height/{height}", get(block_by_height))
        .route("/blocks/hash/{hash}", get(block_by_hash))
        .route("/blocks", get(blocks))
        .route("/coins/block/{hash}", get(coins_by_block))
        .with_state(app)
        .layer(cors)
}

#[derive(Serialize)]
pub struct StateResponse {
    pub peak_height: u32,
}

async fn state(State(app): State<App>) -> Result<Json<StateResponse>, StatusCode> {
    let height = app.db.peak_height().unwrap().unwrap_or(0);

    Ok(Json(StateResponse {
        peak_height: height,
    }))
}

async fn latest_block(State(app): State<App>) -> Result<Json<BlockRow>, StatusCode> {
    let Some(height) = app.db.peak_height().unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    let Some(block) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(block))
}

async fn block_by_height(
    State(app): State<App>,
    Path(height): Path<u32>,
) -> Result<Json<BlockRow>, StatusCode> {
    let Some(block) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(block))
}

async fn block_by_hash(
    State(app): State<App>,
    Path(hash): Path<Bytes32>,
) -> Result<Json<BlockRow>, StatusCode> {
    let Some(height) = app.db.block_height(hash).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    let Some(block) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(block))
}

#[derive(Deserialize)]
pub struct BlocksRequest {
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub start: Option<u32>,
    #[serde(default)]
    pub reverse: bool,
}

fn default_limit() -> u32 {
    50
}

#[derive(Serialize)]
pub struct BlocksResponse {
    pub blocks: Vec<BlockRow>,
}

async fn blocks(
    State(app): State<App>,
    Query(query): Query<BlocksRequest>,
) -> Result<Json<BlocksResponse>, StatusCode> {
    let (start, end) = if query.reverse {
        let end = query
            .start
            .unwrap_or(app.db.peak_height().unwrap().unwrap_or(0));
        let start = end.saturating_sub(query.limit);
        (start, end)
    } else {
        let start = query.start.unwrap_or(0);
        let end = start + query.limit;
        (start, end)
    };

    let blocks = app
        .db
        .blocks_range(
            start,
            end,
            if query.reverse {
                Direction::Reverse
            } else {
                Direction::Forward
            },
        )
        .unwrap();

    Ok(Json(BlocksResponse { blocks }))
}

#[derive(Serialize)]
pub struct CoinsResponse {
    pub coins: Vec<CoinRow>,
}

async fn coins_by_block(
    State(app): State<App>,
    Path(hash): Path<Bytes32>,
) -> Result<Json<CoinsResponse>, StatusCode> {
    let Some(height) = app.db.block_height(hash).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    let mut coins = HashSet::<Bytes32>::from_iter(app.db.lookup_spent_height(height).unwrap());
    coins.extend(app.db.lookup_created_height(height).unwrap());

    let coins = coins
        .into_iter()
        .filter_map(|coin| app.db.coin(coin).unwrap())
        .collect_vec();

    Ok(Json(CoinsResponse { coins }))
}
