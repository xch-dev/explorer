use std::collections::HashMap;
use std::io::Cursor;
use std::time::Instant;

use anyhow::Result;
use chia::{protocol::FullBlock, traits::Streamable};
use chia_wallet_sdk::coinset::{ChiaRpcClient, FullNodeClient};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use sqlx::{Row, SqlitePool};
use tracing::debug;
use zstd::decode_all;

use crate::config::Config;
use crate::db::{CoinSpend, Database};
use crate::parse_blocks;
use crate::process::process_blocks;

pub struct Sync {
    db: Database,
    config: Config,
    sqlite: SqlitePool,
    rpc: FullNodeClient,
}

impl Sync {
    pub fn new(db: Database, config: Config, sqlite: SqlitePool, rpc: FullNodeClient) -> Self {
        Self {
            db,
            config,
            sqlite,
            rpc,
        }
    }

    pub async fn start(self) -> Result<()> {
        let peak_height = self
            .rpc
            .get_blockchain_state()
            .await?
            .blockchain_state
            .unwrap()
            .peak
            .height;

        let mut sync_height = self.db.peak().unwrap().map_or(0, |(height, _)| height + 1);

        let mut instant = Instant::now();
        let mut blocks_processed = 0;

        while sync_height < peak_height {
            if instant.elapsed().as_secs() > 60 {
                debug!("Resetting start time");
                instant = Instant::now();
                blocks_processed = 0;
            }

            let blocks_remaining = peak_height - sync_height;
            let blocks_per_second = blocks_processed as f32 / instant.elapsed().as_secs_f32();

            if blocks_per_second > 0.0 {
                let seconds_remaining = blocks_remaining as f32 / blocks_per_second;
                let hours = (seconds_remaining / 3600.0).floor();
                let minutes = ((seconds_remaining % 3600.0) / 60.0).floor();
                let seconds = seconds_remaining % 60.0;

                debug!(
                    "Estimated time remaining: {}h {}m {}s ({} blocks at {:.1} blocks/sec)",
                    hours,
                    minutes,
                    seconds.floor(),
                    blocks_remaining,
                    blocks_per_second
                );
            }

            let response = sqlx::query(&format!(
                "SELECT block FROM full_blocks WHERE in_main_chain = 1 AND height IN ({})",
                (sync_height..sync_height + self.config.batch_size)
                    .map(|h| h.to_string())
                    .collect::<Vec<String>>()
                    .join(",")
            ))
            .fetch_all(&self.sqlite)
            .await?;

            let blobs = response
                .into_par_iter()
                .map(|row| row.get::<Vec<u8>, _>("block"))
                .collect::<Vec<_>>();

            let blocks = parse_blocks(blobs);

            let mut refs = HashMap::new();

            for block in &blocks {
                for &ref_block in &block.transactions_generator_ref_list {
                    if refs.contains_key(&ref_block) {
                        continue;
                    }

                    let response = sqlx::query(&format!(
                        "SELECT block FROM full_blocks WHERE in_main_chain = 1 AND height = {ref_block}"
                    ))
                    .fetch_one(&self.sqlite)
                    .await?;

                    let blob = response.get::<Vec<u8>, _>("block");
                    let block =
                        FullBlock::from_bytes(&decode_all(Cursor::new(blob)).unwrap()).unwrap();

                    refs.insert(ref_block, block);
                }
            }

            let process_start = Instant::now();

            let mut insertions = process_blocks(blocks, refs);

            let process_duration = process_start.elapsed();

            let mut tx = self.db.transaction();

            let insert_start = Instant::now();

            let mut block_inserts = 0;
            let mut coin_inserts = 0;
            let mut cat_tail_inserts = 0;
            let mut coin_spend_inserts = 0;

            for (height, block) in insertions.blocks {
                tx.create_block(height, &block)?;
                block_inserts += 1;
            }

            for (coin_id, mut coin) in insertions.coins {
                if let Some(item) = insertions.coin_spends.shift_remove(&coin_id) {
                    coin.spend = Some(CoinSpend {
                        spent_height: item.spent_height,
                        puzzle_reveal: item.puzzle_reveal,
                        solution: item.solution,
                    });

                    if let Some(kind) = item.kind {
                        coin.kind = Some(kind);
                    }

                    if let Some(p2_puzzle) = item.p2_puzzle {
                        coin.p2_puzzle = Some(p2_puzzle);
                    }
                }

                tx.create_coin(&coin)?;
                coin_inserts += 1;
            }

            for (coin_id, item) in insertions.coin_spends {
                tx.spend_coin(
                    coin_id,
                    CoinSpend {
                        spent_height: item.spent_height,
                        puzzle_reveal: item.puzzle_reveal,
                        solution: item.solution,
                    },
                    item.kind,
                    item.p2_puzzle,
                )?;
                coin_spend_inserts += 1;
            }

            tx.commit()?;

            let insert_duration = insert_start.elapsed();

            sync_height += self.config.batch_size;
            blocks_processed += self.config.batch_size;

            debug!(
                "{} blocks processed in {:?}, with an average of {} per batch",
                blocks_processed,
                instant.elapsed(),
                instant.elapsed().as_secs_f32()
                    / (blocks_processed as f32 / self.config.batch_size as f32)
            );

            debug!(
                "process: {:?}, insert: {:?}",
                process_duration, insert_duration
            );

            debug!(
                "{} blocks, {} coins, {} tails, {} spends",
                block_inserts, coin_inserts, cat_tail_inserts, coin_spend_inserts
            );

            debug!("Synced to height {}\n", sync_height);
        }

        Ok(())
    }
}
