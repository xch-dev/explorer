mod process;

use std::collections::HashMap;
use std::time::Instant;
use std::{fs, io::Cursor};

use anyhow::Result;
use chia::protocol::Bytes;
use chia::{
    protocol::{Bytes32, FullBlock},
    traits::Streamable,
};
use chia_streamable_macro::Streamable;
use chia_wallet_sdk::coinset::{ChiaRpcClient, FullNodeClient};
use process::{process_blocks, Insertion};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use rocksdb::{ColumnFamily, ColumnFamilyDescriptor, MergeOperands, Options, WriteBatch, DB};
use sqlx::{Row, SqlitePool};
use zstd::decode_all;

#[derive(Streamable)]
struct TransactionBlockRow {
    timestamp: u64,
    fees: u64,
    cost: u64,
}

#[derive(Streamable)]
struct CoinRow {
    parent_coin_id: Bytes32,
    puzzle_hash: Bytes32,
    amount: u64,
    created_height: Option<u32>,
    reward: bool,
    hint: Option<Bytes32>,
    memos: Option<Bytes>,
}

#[derive(Streamable)]
struct SingletonRow {
    launcher_id: Bytes32,
    inner_puzzle_hash: Bytes32,
}

#[derive(Streamable)]
struct CatRow {
    asset_id: Bytes32,
    inner_puzzle_hash: Bytes32,
}

#[derive(Streamable)]
struct CoinSpendRow {
    puzzle_reveal: Bytes,
    solution: Bytes,
}

struct Database(DB);

struct Column {
    name: &'static str,
    index: bool,
}

struct Transaction<'a> {
    db: &'a Database,
    batch: WriteBatch,
}

impl<'a> Transaction<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self {
            db,
            batch: WriteBatch::new(),
        }
    }

    pub fn set_peak_height(&mut self, height: u32) -> Result<()> {
        self.batch.put(b"peak_height", height.to_be_bytes());
        Ok(())
    }

    pub fn put_block(&mut self, height: u32, header_hash: Bytes32) -> Result<()> {
        self.batch.put_cf(
            self.db.block_cf(),
            height.to_be_bytes(),
            header_hash.as_ref(),
        );
        Ok(())
    }

    pub fn put_transaction_block(
        &mut self,
        height: u32,
        transaction_block: &TransactionBlockRow,
    ) -> Result<()> {
        self.batch.put_cf(
            self.db.transaction_block_cf(),
            height.to_be_bytes(),
            transaction_block.to_bytes()?,
        );
        Ok(())
    }

    pub fn put_coin(&mut self, coin_id: Bytes32, coin: &CoinRow) -> Result<()> {
        self.batch
            .put_cf(self.db.coin_cf(), coin_id, coin.to_bytes()?);

        self.add_to_puzzle_hash_index(coin.puzzle_hash, coin_id)?;
        self.add_to_parent_coin_id_index(coin.parent_coin_id, coin_id)?;

        if let Some(hint) = coin.hint {
            self.add_to_hint_index(hint, coin_id)?;
        }

        if let Some(created_height) = coin.created_height {
            self.add_to_created_height_index(created_height, coin_id)?;
        }

        Ok(())
    }

    pub fn put_singleton(&mut self, coin_id: Bytes32, singleton: &SingletonRow) -> Result<()> {
        self.batch
            .put_cf(self.db.singleton_cf(), coin_id, singleton.to_bytes()?);
        Ok(())
    }

    pub fn put_cat(&mut self, coin_id: Bytes32, cat: &CatRow) -> Result<()> {
        self.batch
            .put_cf(self.db.cat_cf(), coin_id, cat.to_bytes()?);
        Ok(())
    }

    pub fn put_tail(&mut self, asset_id: Bytes32, tail: &Bytes) -> Result<()> {
        self.batch.put_cf(self.db.tail_cf(), asset_id, tail);
        Ok(())
    }

    pub fn put_coin_spend(&mut self, coin_id: Bytes32, coin_spend: &CoinSpendRow) -> Result<()> {
        self.batch
            .put_cf(self.db.coin_spend_cf(), coin_id, coin_spend.to_bytes()?);
        Ok(())
    }

    pub fn add_to_puzzle_hash_index(
        &mut self,
        puzzle_hash: Bytes32,
        coin_id: Bytes32,
    ) -> Result<()> {
        let key = [puzzle_hash.as_ref(), coin_id.as_ref()].concat();
        self.batch.put_cf(self.db.puzzle_hash_index_cf(), &key, []);
        Ok(())
    }

    pub fn add_to_parent_coin_id_index(
        &mut self,
        parent_coin_id: Bytes32,
        coin_id: Bytes32,
    ) -> Result<()> {
        let key = [parent_coin_id.as_ref(), coin_id.as_ref()].concat();
        self.batch
            .put_cf(self.db.parent_coin_id_index_cf(), &key, []);
        Ok(())
    }

    pub fn add_to_hint_index(&mut self, hint: Bytes32, coin_id: Bytes32) -> Result<()> {
        let key = [hint.as_ref(), coin_id.as_ref()].concat();
        self.batch.put_cf(self.db.hint_index_cf(), &key, []);
        Ok(())
    }

    pub fn add_to_created_height_index(
        &mut self,
        created_height: u32,
        coin_id: Bytes32,
    ) -> Result<()> {
        let key = [&created_height.to_be_bytes(), coin_id.as_ref()].concat();
        self.batch
            .put_cf(self.db.created_height_index_cf(), &key, []);
        Ok(())
    }

    pub fn add_to_spent_height_index(&mut self, spent_height: u32, coin_id: Bytes32) -> Result<()> {
        let key = [&spent_height.to_be_bytes(), coin_id.as_ref()].concat();
        self.batch.put_cf(self.db.spent_height_index_cf(), &key, []);
        Ok(())
    }

    pub fn commit(self) -> Result<()> {
        self.db.0.write(self.batch)?;
        Ok(())
    }
}

impl Database {
    pub fn new() -> Result<Self> {
        let cf_names = [
            Column {
                name: "blocks",
                index: false,
            },
            Column {
                name: "transaction_blocks",
                index: false,
            },
            Column {
                name: "coins",
                index: false,
            },
            Column {
                name: "singletons",
                index: false,
            },
            Column {
                name: "cats",
                index: false,
            },
            Column {
                name: "tails",
                index: false,
            },
            Column {
                name: "coin_spends",
                index: false,
            },
            Column {
                name: "puzzle_hash_index",
                index: true,
            },
            Column {
                name: "parent_coin_id_index",
                index: true,
            },
            Column {
                name: "hint_index",
                index: true,
            },
            Column {
                name: "created_height_index",
                index: true,
            },
            Column {
                name: "spent_height_index",
                index: true,
            },
        ];

        let mut options = Options::default();
        options.create_if_missing(true);
        options.create_missing_column_families(true);
        options.set_max_background_jobs(8);
        options.increase_parallelism(num_cpus::get() as i32);
        options.set_write_buffer_size(512 * 1024 * 1024);
        options.set_max_write_buffer_number(6);
        options.set_max_background_jobs(4);
        options.set_target_file_size_base(64 * 1024 * 1024);
        options.set_disable_auto_compactions(false);
        options.prepare_for_bulk_load();

        // Create column family descriptors with custom options
        let cf_descriptors: Vec<ColumnFamilyDescriptor> = cf_names
            .iter()
            .map(|column| {
                let mut cf_opts = Options::default();

                // Optimize index column families
                if column.index {
                    cf_opts.set_prefix_extractor(rocksdb::SliceTransform::create_fixed_prefix(32));
                    cf_opts.set_memtable_prefix_bloom_ratio(0.1);
                }

                // Use different settings for coin data vs indexes
                if column.index {
                    cf_opts.set_merge_operator_associative("test operator", concat_merge);
                    cf_opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
                } else {
                    cf_opts.set_compression_type(rocksdb::DBCompressionType::Lz4);
                    cf_opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
                }

                ColumnFamilyDescriptor::new(column.name.to_string(), cf_opts)
            })
            .collect();

        // Open database with column families
        let db = DB::open_cf_descriptors(&options, "test.db", cf_descriptors)?;

        Ok(Self(db))
    }

    pub fn peak_height(&self) -> Result<Option<u32>> {
        let height = self.0.get(b"peak_height")?;
        Ok(height.map(|bytes| u32::from_be_bytes(bytes.try_into().unwrap())))
    }

    pub fn coin(&self, coin_id: Bytes32) -> Result<Option<CoinRow>> {
        Ok(self
            .0
            .get_cf(self.coin_cf(), coin_id)?
            .map(|bytes| CoinRow::from_bytes(&bytes))
            .transpose()?)
    }

    pub fn lookup_puzzle_hash(&self, puzzle_hash: Bytes32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .0
            .prefix_iterator_cf(self.puzzle_hash_index_cf(), puzzle_hash.as_ref());

        for item in iter {
            let (key, _) = item?;

            if key.len() == 64 {
                let coin_id = Bytes32::try_from(&key[32..64]).unwrap();
                result.push(coin_id);
            }
        }

        Ok(result)
    }

    pub fn lookup_parent_coin_id(&self, parent_coin_id: Bytes32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .0
            .prefix_iterator_cf(self.parent_coin_id_index_cf(), parent_coin_id.as_ref());

        for item in iter {
            let (key, _) = item?;

            if key.len() == 64 {
                let coin_id = Bytes32::try_from(&key[32..64]).unwrap();
                result.push(coin_id);
            }
        }

        Ok(result)
    }

    pub fn lookup_hint(&self, hint: Bytes32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .0
            .prefix_iterator_cf(self.hint_index_cf(), hint.as_ref());

        for item in iter {
            let (key, _) = item?;

            if key.len() == 64 {
                let coin_id = Bytes32::try_from(&key[32..64]).unwrap();
                result.push(coin_id);
            }
        }

        Ok(result)
    }

    pub fn lookup_created_height(&self, created_height: u32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .0
            .prefix_iterator_cf(self.created_height_index_cf(), created_height.to_be_bytes());

        for item in iter {
            let (key, _) = item?;

            if key.len() == 36 {
                let coin_id = Bytes32::try_from(&key[4..36]).unwrap();
                result.push(coin_id);
            }
        }

        Ok(result)
    }

    pub fn lookup_spent_height(&self, spent_height: u32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .0
            .prefix_iterator_cf(self.spent_height_index_cf(), spent_height.to_be_bytes());

        for item in iter {
            let (key, _) = item?;

            if key.len() == 36 {
                let coin_id = Bytes32::try_from(&key[4..36]).unwrap();
                result.push(coin_id);
            }
        }

        Ok(result)
    }

    fn block_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("blocks").unwrap()
    }

    fn transaction_block_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("transaction_blocks").unwrap()
    }

    fn coin_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coins").unwrap()
    }

    fn singleton_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("singletons").unwrap()
    }

    fn cat_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("cats").unwrap()
    }

    fn tail_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("tails").unwrap()
    }

    fn coin_spend_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coin_spends").unwrap()
    }

    fn puzzle_hash_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("puzzle_hash_index").unwrap()
    }

    fn parent_coin_id_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("parent_coin_id_index").unwrap()
    }

    fn hint_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("hint_index").unwrap()
    }

    fn created_height_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("created_height_index").unwrap()
    }

    fn spent_height_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("spent_height_index").unwrap()
    }

    pub fn transaction(&self) -> Transaction {
        Transaction::new(self)
    }
}

const BATCH_SIZE: u32 = 1000;

#[tokio::main]
async fn main() -> Result<()> {
    let db = Database::new()?;

    let blockchain_db = SqlitePool::connect(
        "sqlite:///Users/rigidity/.chia/mainnet/db/blockchain_v2_mainnet.sqlite",
    )
    .await?;

    let cert = fs::read("private_daemon.crt")?;
    let key = fs::read("private_daemon.key")?;

    let client = FullNodeClient::new(&cert, &key);

    let peak_height = client
        .get_blockchain_state()
        .await?
        .blockchain_state
        .unwrap()
        .peak
        .height;

    let mut sync_height = db.peak_height()?.unwrap_or(0);

    let mut instant = Instant::now();
    let mut blocks_processed = 0;

    while sync_height < peak_height {
        if instant.elapsed().as_secs() > 60 {
            println!("Resetting start time");
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

            println!(
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
        .fetch_all(&blockchain_db)
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
                .fetch_one(&blockchain_db)
                .await?;

                let blob = response.get::<Vec<u8>, _>("block");
                let block = FullBlock::from_bytes(&decode_all(Cursor::new(blob)).unwrap()).unwrap();

                refs.insert(ref_block, block);
            }
        }

        let process_start = Instant::now();

        let mut insertions = process_blocks(blocks, refs);

        let process_duration = process_start.elapsed();

        let mut tx = db.transaction();

        let insert_start = Instant::now();

        let mut block_inserts = 0;
        let mut transaction_block_inserts = 0;
        let mut coin_inserts = 0;
        let mut singleton_coin_inserts = 0;
        let mut cat_coin_inserts = 0;
        let mut cat_tail_inserts = 0;
        let mut coin_spend_inserts = 0;

        insertions.sort();

        for insertion in insertions {
            match insertion {
                Insertion::Block {
                    height,
                    header_hash,
                } => {
                    tx.put_block(height, header_hash)?;

                    block_inserts += 1;
                }
                Insertion::TransactionBlock {
                    height,
                    timestamp,
                    fees,
                    cost,
                } => {
                    tx.put_transaction_block(
                        height,
                        &TransactionBlockRow {
                            timestamp,
                            fees,
                            cost,
                        },
                    )?;

                    transaction_block_inserts += 1;
                }
                Insertion::Coin {
                    coin,
                    hint,
                    created_height,
                    memos,
                    reward,
                } => {
                    let coin_id = coin.coin_id();

                    tx.put_coin(
                        coin_id,
                        &CoinRow {
                            parent_coin_id: coin.parent_coin_info,
                            puzzle_hash: coin.puzzle_hash,
                            amount: coin.amount,
                            created_height: Some(created_height),
                            hint,
                            memos: memos.map(Bytes::new),
                            reward,
                        },
                    )?;

                    coin_inserts += 1;
                }
                Insertion::SingletonCoin {
                    coin_id,
                    launcher_id,
                    inner_puzzle_hash,
                } => {
                    tx.put_singleton(
                        coin_id,
                        &SingletonRow {
                            launcher_id,
                            inner_puzzle_hash,
                        },
                    )?;

                    singleton_coin_inserts += 1;
                }
                Insertion::CatCoin {
                    coin_id,
                    asset_id,
                    inner_puzzle_hash,
                } => {
                    tx.put_cat(
                        coin_id,
                        &CatRow {
                            asset_id,
                            inner_puzzle_hash,
                        },
                    )?;

                    cat_coin_inserts += 1;
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

        println!(
            "{} blocks processed in {:?}, with an average of {} per batch",
            blocks_processed,
            instant.elapsed(),
            instant.elapsed().as_secs_f32() / (blocks_processed as f32 / BATCH_SIZE as f32)
        );

        println!(
            "process: {:?}, insert: {:?}",
            process_duration, insert_duration
        );

        println!(
            "{} blocks, {} tx blocks, {} coins, {} singletons, {} cats, {} tails, {} spends",
            block_inserts,
            transaction_block_inserts,
            coin_inserts,
            singleton_coin_inserts,
            cat_coin_inserts,
            cat_tail_inserts,
            coin_spend_inserts
        );

        println!("Synced to height {}\n", sync_height);
    }

    Ok(())
}

fn concat_merge(
    _new_key: &[u8],
    existing_val: Option<&[u8]>,
    operands: &MergeOperands,
) -> Option<Vec<u8>> {
    let mut result: Vec<u8> = Vec::with_capacity(operands.len());
    if let Some(v) = existing_val {
        for e in v {
            result.push(*e)
        }
    }
    for op in operands {
        for e in op {
            result.push(*e)
        }
    }
    Some(result)
}

fn parse_blocks(blocks: Vec<Vec<u8>>) -> Vec<FullBlock> {
    blocks
        .into_par_iter()
        .map(|data| FullBlock::from_bytes(&decode_all(Cursor::new(data)).unwrap()).unwrap())
        .collect()
}
