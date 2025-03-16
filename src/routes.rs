use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chia::protocol::Bytes32;
use serde::{Deserialize, Serialize};
use serde_with::{hex::Hex, serde_as};

use crate::db::Database;

#[derive(Clone)]
pub struct App {
    pub db: Database,
}

pub fn router(state: App) -> Router {
    Router::new()
        .route("/block/{height}", get(block))
        .with_state(state)
}

#[serde_as]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
struct ApiBlock {
    height: u32,
    #[serde_as(as = "Hex")]
    header_hash: Bytes32,
    timestamp: Option<u64>,
    cost: Option<u64>,
    fees: Option<u64>,
}

async fn block(
    State(app): State<App>,
    Path(height): Path<u32>,
) -> Result<Json<ApiBlock>, StatusCode> {
    let Some(header_hash) = app.db.block(height).unwrap() else {
        return Err(StatusCode::NOT_FOUND);
    };

    let tx = app.db.transaction_block(height).unwrap();

    Ok(Json(ApiBlock {
        height,
        header_hash,
        timestamp: tx.as_ref().map(|tx| tx.timestamp),
        cost: tx.as_ref().map(|tx| tx.cost),
        fees: tx.as_ref().map(|tx| tx.fees),
    }))
}
