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
        .route("/coins/children/{coin_id}", get(coins_by_parent))
        .with_state(app)
        .layer(cors)
}

#[derive(Serialize)]
pub struct Coin {
    pub coin_id: Bytes32,
    #[serde(flatten)]
    pub row: CoinRow,
}

#[derive(Serialize)]
pub struct Block {
    pub height: u32,
    #[serde(flatten)]
    pub row: BlockRow,
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

#[derive(Serialize)]
pub struct BlockResponse {
    pub block: Block,
}

async fn latest_block(State(app): State<App>) -> Result<Json<BlockResponse>, StatusCode> {
    let Some(height) = app.db.peak_height().unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    let Some(block) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(BlockResponse {
        block: Block { height, row: block },
    }))
}

async fn block_by_height(
    State(app): State<App>,
    Path(height): Path<u32>,
) -> Result<Json<BlockResponse>, StatusCode> {
    let Some(block) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(BlockResponse {
        block: Block { height, row: block },
    }))
}

async fn block_by_hash(
    State(app): State<App>,
    Path(hash): Path<Bytes32>,
) -> Result<Json<BlockResponse>, StatusCode> {
    let Some(height) = app.db.block_height(hash).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    let Some(block) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(BlockResponse {
        block: Block { height, row: block },
    }))
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
    pub blocks: Vec<Block>,
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

    Ok(Json(BlocksResponse {
        blocks: blocks
            .into_iter()
            .enumerate()
            .map(|(offset, block)| Block {
                height: if query.reverse {
                    end - offset as u32
                } else {
                    start + offset as u32
                },
                row: block,
            })
            .collect_vec(),
    }))
}

#[derive(Serialize)]
pub struct CoinsResponse {
    pub coins: Vec<Coin>,
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
        .filter_map(|coin_id| {
            let row = app.db.coin(coin_id).unwrap()?;
            Some(Coin { coin_id, row })
        })
        .collect_vec();

    Ok(Json(CoinsResponse { coins }))
}

async fn coins_by_parent(
    State(app): State<App>,
    Path(coin_id): Path<Bytes32>,
) -> Result<Json<CoinsResponse>, StatusCode> {
    let coins = app.db.lookup_parent_coin_id(coin_id).unwrap();

    let coins = coins
        .into_iter()
        .filter_map(|coin_id| {
            let row = app.db.coin(coin_id).unwrap()?;
            Some(Coin { coin_id, row })
        })
        .collect_vec();

    Ok(Json(CoinsResponse { coins }))
}
