use std::collections::HashMap;
use std::io::Cursor;
use std::time::Instant;

use anyhow::Result;
use chia::{protocol::FullBlock, traits::Streamable};
use chia_wallet_sdk::{
    coinset::{ChiaRpcClient, FullNodeClient},
    prelude::Allocator,
};
use indexmap::IndexMap;
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use sqlx::{Row, SqlitePool};
use tracing::debug;
use xchdev_db::Database;
use xchdev_parser::parse_block;
use zstd::decode_all;

use crate::config::Config;

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

        let mut sync_height = self
            .db
            .peak()
            .unwrap()
            .map_or(7000000, |(height, _)| height + 1);

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
                "SELECT block FROM full_blocks WHERE in_main_chain = 1 AND height IN ({}) ORDER BY height ASC",
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

            let parsed = blocks
                .into_par_iter()
                .map(|block| {
                    let mut allocator = Allocator::new();
                    parse_block(&mut allocator, &block, &refs)
                })
                .collect::<xchdev_parser::Result<Vec<_>>>()
                .unwrap();

            let process_duration = process_start.elapsed();

            let mut tx = self.db.transaction();

            let insert_start = Instant::now();

            let mut block_inserts = 0;
            let mut coin_inserts = 0;
            let mut coin_spend_inserts = 0;

            let mut created_coins = IndexMap::new();

            for item in parsed {
                tx.insert_block(item.block_record.height, &item.block_record)?;
                block_inserts += 1;

                for coin_record in item.additions {
                    created_coins.insert(coin_record.coin.coin_id(), coin_record);
                }

                for update in item.updates {
                    tx.insert_coin_spend(&update.spend)?;
                    coin_spend_inserts += 1;

                    let coin_id = update.spend.coin.coin_id();

                    let Some(coin_record) = created_coins.get_mut(&coin_id) else {
                        let Some(mut coin_record) = self.db.coin(coin_id)? else {
                            continue;
                        };

                        update.apply(&mut coin_record);
                        tx.insert_coin(&coin_record)?;

                        continue;
                    };

                    update.apply(coin_record);
                }
            }

            for coin_record in created_coins.into_values() {
                tx.insert_coin(&coin_record)?;
                coin_inserts += 1;
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
                "{} blocks, {} coins, {} spends",
                block_inserts, coin_inserts, coin_spend_inserts
            );

            debug!("Synced to height {}\n", sync_height);
        }

        Ok(())
    }
}

fn parse_blocks(blocks: Vec<Vec<u8>>) -> Vec<FullBlock> {
    blocks
        .into_par_iter()
        .map(|data| FullBlock::from_bytes(&decode_all(Cursor::new(data)).unwrap()).unwrap())
        .collect()
}
