use std::sync::Arc;

use anyhow::Result;
use chia::protocol::{Bytes, Bytes32};
use chia_streamable_macro::Streamable;
use chia_traits::Streamable;
use rocksdb::{ColumnFamily, ColumnFamilyDescriptor, MergeOperands, Options, WriteBatch, DB};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Streamable, Serialize, Deserialize)]
pub struct BlockRow {
    pub height: u32,
    pub header_hash: Bytes32,
    pub weight: u128,
    pub total_iters: u128,
    pub prev_block_hash: Bytes32,
    pub farmer_puzzle_hash: Bytes32,
    pub pool_puzzle_hash: Option<Bytes32>,
    pub transaction_info: Option<TransactionInfo>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Streamable, Serialize, Deserialize)]
pub struct TransactionInfo {
    pub timestamp: u64,
    pub fees: u64,
    pub cost: u64,
    pub additions: u32,
    pub removals: u32,
    pub prev_transaction_block_hash: Bytes32,
}

#[derive(Streamable)]
pub struct CoinRow {
    pub parent_coin_id: Bytes32,
    pub puzzle_hash: Bytes32,
    pub amount: u64,
    pub created_height: Option<u32>,
    pub reward: bool,
    pub hint: Option<Bytes32>,
    pub memos: Option<Bytes>,
}

#[derive(Streamable)]
pub struct SingletonRow {
    pub launcher_id: Bytes32,
    pub inner_puzzle_hash: Bytes32,
}

#[derive(Streamable)]
pub struct CatRow {
    pub asset_id: Bytes32,
    pub inner_puzzle_hash: Bytes32,
}

#[derive(Streamable)]
pub struct CoinSpendRow {
    pub puzzle_reveal: Bytes,
    pub solution: Bytes,
}

#[derive(Clone)]
pub struct Database(Arc<DB>);

pub struct Column {
    name: &'static str,
    prefix: Option<usize>,
}

pub struct Transaction<'a> {
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

    pub fn put_block(&mut self, block: &BlockRow) -> Result<()> {
        self.batch.put_cf(
            self.db.block_cf(),
            block.height.to_be_bytes(),
            block.to_bytes()?,
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
                prefix: None,
            },
            Column {
                name: "coins",
                prefix: None,
            },
            Column {
                name: "singletons",
                prefix: None,
            },
            Column {
                name: "cats",
                prefix: None,
            },
            Column {
                name: "tails",
                prefix: None,
            },
            Column {
                name: "coin_spends",
                prefix: None,
            },
            Column {
                name: "puzzle_hash_index",
                prefix: Some(32),
            },
            Column {
                name: "hint_index",
                prefix: Some(32),
            },
            Column {
                name: "parent_coin_id_index",
                prefix: Some(32),
            },
            Column {
                name: "created_height_index",
                prefix: Some(4),
            },
            Column {
                name: "spent_height_index",
                prefix: Some(4),
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
                if let Some(prefix) = column.prefix {
                    cf_opts
                        .set_prefix_extractor(rocksdb::SliceTransform::create_fixed_prefix(prefix));
                    cf_opts.set_memtable_prefix_bloom_ratio(0.1);
                }

                cf_opts.set_compression_type(rocksdb::DBCompressionType::Lz4);

                // Use different settings for coin data vs indexes
                if column.prefix.is_some() {
                    cf_opts.set_merge_operator_associative("test operator", concat_merge);
                } else {
                    cf_opts.set_bottommost_compression_type(rocksdb::DBCompressionType::Zstd);
                }

                ColumnFamilyDescriptor::new(column.name.to_string(), cf_opts)
            })
            .collect();

        // Open database with column families
        let db = DB::open_cf_descriptors(&options, "test.db", cf_descriptors)?;

        Ok(Self(Arc::new(db)))
    }

    pub fn peak_height(&self) -> Result<Option<u32>> {
        let height = self.0.get(b"peak_height")?;
        Ok(height.map(|bytes| u32::from_be_bytes(bytes.try_into().unwrap())))
    }

    pub fn block(&self, height: u32) -> Result<Option<BlockRow>> {
        let block = self.0.get_cf(self.block_cf(), height.to_be_bytes())?;
        Ok(block.map(|bytes| BlockRow::from_bytes(&bytes).unwrap()))
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
