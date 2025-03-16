mod db;
mod process;
mod sync;

use std::{fs, io::Cursor};

use anyhow::Result;
use chia::{protocol::FullBlock, traits::Streamable};
use chia_wallet_sdk::coinset::FullNodeClient;
use db::Database;
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use sqlx::SqlitePool;
use sync::Sync;
use tracing_subscriber::EnvFilter;
use zstd::decode_all;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new("DEBUG,sqlx=off"))
        .with_target(false)
        .init();

    let db = Database::new()?;

    let sqlite = SqlitePool::connect(
        "sqlite:///Users/rigidity/.chia/mainnet/db/blockchain_v2_mainnet.sqlite",
    )
    .await?;
    let cert = fs::read("private_daemon.crt")?;
    let key = fs::read("private_daemon.key")?;
    let rpc = FullNodeClient::new(&cert, &key);

    let sync = Sync::new(db, sqlite, rpc);
    sync.start().await?;

    Ok(())
}

fn parse_blocks(blocks: Vec<Vec<u8>>) -> Vec<FullBlock> {
    blocks
        .into_par_iter()
        .map(|data| FullBlock::from_bytes(&decode_all(Cursor::new(data)).unwrap()).unwrap())
        .collect()
}
