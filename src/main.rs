mod config;
mod db;
mod process;
mod routes;
mod sync;

use std::{fs, io::Cursor};

use anyhow::Result;
use chia::{protocol::FullBlock, traits::Streamable};
use chia_wallet_sdk::coinset::FullNodeClient;
use config::Config;
use db::Database;
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use routes::{router, App};
use sqlx::SqlitePool;
use sync::Sync;
use tokio::net::TcpListener;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;
use zstd::decode_all;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new("DEBUG,sqlx=off"))
        .with_target(false)
        .init();

    let config = Config::load()?;

    fs::create_dir_all(config.db_path.parent().unwrap())?;

    let db = Database::new(&config.db_path)?;

    let sqlite = SqlitePool::connect(&format!(
        "sqlite://{}",
        config.blockchain_db_path.to_str().unwrap()
    ))
    .await?;
    let cert = fs::read(&config.cert_path)?;
    let key = fs::read_to_string(&config.key_path)?;
    let key = topk8::from_pkcs1_pem(&key).unwrap_or(key);
    let rpc = FullNodeClient::new(&cert, key.as_bytes());

    let sync = Sync::new(db.clone(), config.clone(), sqlite, rpc);

    tokio::spawn(async move {
        if let Err(error) = sync.start().await {
            error!("Sync error: {}", error);
        }
    });

    let app = router(App { db });
    let listener = TcpListener::bind(format!("0.0.0.0:{}", config.port)).await?;
    info!("Listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await?;

    Ok(())
}

fn parse_blocks(blocks: Vec<Vec<u8>>) -> Vec<FullBlock> {
    blocks
        .into_par_iter()
        .map(|data| FullBlock::from_bytes(&decode_all(Cursor::new(data)).unwrap()).unwrap())
        .collect()
}
