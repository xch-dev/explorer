use axum::{
    extract::{Path, Query, State},
    http::{Method, StatusCode},
    routing::get,
    Json, Router,
};
use chia::protocol::Bytes32;
use indexmap::IndexMap;
use itertools::Itertools;
use rocksdb::Direction;
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};
use xchdev_db::Database;
use xchdev_types::{BlockRecord, CoinRecord, CoinSpendRecord};

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
        .route("/coins/id/{coin_id}", get(coin_by_id))
        .route("/spends/block/{hash}", get(spends_by_block))
        .route("/spends/id/{coin_id}", get(spend_by_id))
        .with_state(app)
        .layer(cors)
}

#[derive(Serialize)]
pub struct Coin {
    pub coin_id: Bytes32,
    #[serde(flatten)]
    pub row: CoinRecord,
}

#[derive(Serialize)]
pub struct Block {
    pub height: u32,
    #[serde(flatten)]
    pub row: BlockRecord,
}

#[derive(Serialize)]
pub struct StateResponse {
    pub peak_height: u32,
}

async fn state(State(app): State<App>) -> Result<Json<StateResponse>, StatusCode> {
    let height = app.db.peak().unwrap().map_or(0, |block| block.0);

    Ok(Json(StateResponse {
        peak_height: height,
    }))
}

#[derive(Serialize)]
pub struct BlockResponse {
    pub block: Block,
}

async fn latest_block(State(app): State<App>) -> Result<Json<BlockResponse>, StatusCode> {
    let Some((height, row)) = app.db.peak().unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(BlockResponse {
        block: Block { height, row },
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
    pub limit: usize,
    #[serde(default)]
    pub start: Option<u32>,
    #[serde(default)]
    pub reverse: bool,
}

fn default_limit() -> usize {
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
    let blocks = app
        .db
        .blocks(
            query.start,
            if query.reverse {
                Direction::Reverse
            } else {
                Direction::Forward
            },
            query.limit,
        )
        .unwrap();

    Ok(Json(BlocksResponse {
        blocks: blocks
            .into_iter()
            .map(|(height, row)| Block { height, row })
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

    let mut coins = IndexMap::new();

    for coin_id in app.db.coins_by_height(height).unwrap() {
        if coins.contains_key(&coin_id) {
            continue;
        }

        let Some(coin) = app.db.coin(coin_id).unwrap() else {
            continue;
        };

        coins.insert(coin_id, Coin { coin_id, row: coin });
    }

    Ok(Json(CoinsResponse {
        coins: coins.into_values().collect_vec(),
    }))
}

async fn coins_by_parent(
    State(app): State<App>,
    Path(coin_id): Path<Bytes32>,
) -> Result<Json<CoinsResponse>, StatusCode> {
    let coins = app.db.coins_by_parent(coin_id).unwrap();

    let coins = coins
        .into_iter()
        .filter_map(|coin_id| {
            let row = app.db.coin(coin_id).unwrap()?;
            Some(Coin { coin_id, row })
        })
        .collect_vec();

    Ok(Json(CoinsResponse { coins }))
}

#[derive(Serialize)]
pub struct CoinResponse {
    pub coin: Coin,
}

async fn coin_by_id(
    State(app): State<App>,
    Path(coin_id): Path<Bytes32>,
) -> Result<Json<CoinResponse>, StatusCode> {
    let Some(row) = app.db.coin(coin_id).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(CoinResponse {
        coin: Coin { coin_id, row },
    }))
}

#[derive(Serialize)]
pub struct SpendsResponse {
    pub spends: Vec<CoinSpendRecord>,
}

async fn spends_by_block(
    State(app): State<App>,
    Path(hash): Path<Bytes32>,
) -> Result<Json<SpendsResponse>, StatusCode> {
    let Some(height) = app.db.block_height(hash).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    let mut spends = IndexMap::new();

    for coin_id in app.db.coins_by_height(height).unwrap() {
        if spends.contains_key(&coin_id) {
            continue;
        }

        let Some(coin) = app.db.coin(coin_id).unwrap() else {
            continue;
        };

        if coin.spent_height != Some(height) {
            continue;
        }

        let Some(spend) = app.db.coin_spend(coin_id).unwrap() else {
            continue;
        };

        spends.insert(coin_id, spend);
    }

    Ok(Json(SpendsResponse {
        spends: spends.into_values().collect_vec(),
    }))
}

#[derive(Serialize)]
pub struct SpendResponse {
    pub spend: CoinSpendRecord,
}

async fn spend_by_id(
    State(app): State<App>,
    Path(coin_id): Path<Bytes32>,
) -> Result<Json<SpendResponse>, StatusCode> {
    let Some(spend) = app.db.coin_spend(coin_id).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    Ok(Json(SpendResponse { spend }))
}
