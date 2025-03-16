use std::collections::HashMap;
use std::io::Cursor;
use std::time::Instant;

use anyhow::Result;
use chia::protocol::Bytes;
use chia::{protocol::FullBlock, traits::Streamable};
use chia_wallet_sdk::coinset::{ChiaRpcClient, FullNodeClient};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use sqlx::{Row, SqlitePool};
use tracing::debug;
use zstd::decode_all;

use crate::db::{CoinSpendRow, Database};
use crate::parse_blocks;
use crate::process::{process_blocks, Insertion};

const BATCH_SIZE: u32 = 1000;

pub struct Sync {
    db: Database,
    sqlite: SqlitePool,
    rpc: FullNodeClient,
}

impl Sync {
    pub fn new(db: Database, sqlite: SqlitePool, rpc: FullNodeClient) -> Self {
        Self { db, sqlite, rpc }
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

        let mut sync_height = self.db.peak_height()?.unwrap_or(0);

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
                (sync_height..sync_height + BATCH_SIZE)
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
                        "SELECT block FROM full_blocks WHERE in_main_chain = 1 AND height = {}",
                        ref_block
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

            insertions.sort();

            for insertion in insertions {
                match insertion {
                    Insertion::Block { block } => {
                        tx.put_block(&block)?;

                        block_inserts += 1;
                    }
                    Insertion::Coin { coin } => {
                        tx.put_coin(&coin)?;

                        coin_inserts += 1;
                    }
                    Insertion::CatTail { asset_id, tail } => {
                        tx.put_tail(asset_id, &Bytes::new(tail))?;

                        cat_tail_inserts += 1;
                    }
                    Insertion::CoinSpend {
                        coin_id,
                        puzzle_reveal,
                        solution,
                        spent_height,
                    } => {
                        tx.put_coin_spend(
                            coin_id,
                            &CoinSpendRow {
                                spent_height,
                                puzzle_reveal: Bytes::new(puzzle_reveal),
                                solution: Bytes::new(solution),
                            },
                        )?;

                        tx.add_to_spent_height_index(spent_height, coin_id)?;

                        coin_spend_inserts += 1;
                    }
                }
            }

            tx.set_peak_height(sync_height)?;

            tx.commit()?;

            let insert_duration = insert_start.elapsed();

            sync_height += BATCH_SIZE;
            blocks_processed += BATCH_SIZE;

            debug!(
                "{} blocks processed in {:?}, with an average of {} per batch",
                blocks_processed,
                instant.elapsed(),
                instant.elapsed().as_secs_f32() / (blocks_processed as f32 / BATCH_SIZE as f32)
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
