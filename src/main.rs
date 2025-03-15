use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use anyhow::Result;
use chia::{
    protocol::{Bytes, Bytes32, Coin},
    traits::Streamable,
};
use chia_streamable_macro::Streamable;
use rand::{rng, Rng};
use rocksdb::{ColumnFamily, ColumnFamilyDescriptor, MergeOperands, Options, WriteBatch, DB};

#[derive(Streamable)]
struct CoinRow {
    parent_coin_id: Bytes32,
    puzzle_hash: Bytes32,
    amount: u64,
    created_height: Option<u32>,
    spent_height: Option<u32>,
    reward: bool,
    hint: Option<Bytes32>,
    memos: Option<Bytes>,
}

struct Database {
    db: Arc<DB>,
    write_buffer: Arc<Mutex<WriteBatch>>,
    buffer_count: Arc<Mutex<usize>>,
    max_buffer_size: usize,
}

struct Column {
    name: &'static str,
    index: bool,
}

impl Database {
    pub fn new() -> Result<Self> {
        let cf_names = [
            Column {
                name: "coins",
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

        Ok(Self {
            db: Arc::new(db),
            write_buffer: Arc::new(Mutex::new(WriteBatch::new())),
            buffer_count: Arc::new(Mutex::new(0)),
            max_buffer_size: 1000,
        })
    }

    pub fn coin(&self, coin_id: Bytes32) -> Result<Option<CoinRow>> {
        Ok(self
            .db
            .get_cf(self.coin_cf(), coin_id)?
            .map(|bytes| CoinRow::from_bytes(&bytes))
            .transpose()?)
    }

    pub fn put_coin(&self, coin_id: Bytes32, coin: &CoinRow) -> Result<()> {
        self.db.put_cf(self.coin_cf(), coin_id, coin.to_bytes()?)?;
        Ok(())
    }

    pub fn add_to_puzzle_hash_index(&self, puzzle_hash: Bytes32, coin_id: Bytes32) -> Result<()> {
        let key = [puzzle_hash.as_ref(), coin_id.as_ref()].concat();
        self.db.put_cf(self.puzzle_hash_index_cf(), &key, [])?;
        Ok(())
    }

    pub fn puzzle_hash_index(&self, puzzle_hash: Bytes32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .db
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

    pub fn add_to_parent_coin_id_index(
        &self,
        parent_coin_id: Bytes32,
        coin_id: Bytes32,
    ) -> Result<()> {
        let key = [parent_coin_id.as_ref(), coin_id.as_ref()].concat();
        self.db.put_cf(self.parent_coin_id_index_cf(), &key, [])?;
        Ok(())
    }

    pub fn parent_coin_id_index(&self, parent_coin_id: Bytes32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .db
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

    pub fn add_to_hint_index(&self, hint: Bytes32, coin_id: Bytes32) -> Result<()> {
        let key = [hint.as_ref(), coin_id.as_ref()].concat();
        self.db.put_cf(self.hint_index_cf(), &key, [])?;
        Ok(())
    }

    pub fn hint_index(&self, hint: Bytes32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .db
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

    pub fn add_to_created_height_index(&self, created_height: u32, coin_id: Bytes32) -> Result<()> {
        let key = [&created_height.to_be_bytes(), coin_id.as_ref()].concat();
        self.db.put_cf(self.created_height_index_cf(), &key, [])?;
        Ok(())
    }

    pub fn created_height_index(&self, created_height: u32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .db
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

    pub fn add_to_spent_height_index(&self, spent_height: u32, coin_id: Bytes32) -> Result<()> {
        let key = [&spent_height.to_be_bytes(), coin_id.as_ref()].concat();
        self.db.put_cf(self.spent_height_index_cf(), &key, [])?;
        Ok(())
    }

    pub fn spent_height_index(&self, spent_height: u32) -> Result<Vec<Bytes32>> {
        let mut result = Vec::new();

        let iter = self
            .db
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

    fn coin_cf(&self) -> &ColumnFamily {
        self.db.cf_handle("coins").unwrap()
    }

    fn puzzle_hash_index_cf(&self) -> &ColumnFamily {
        self.db.cf_handle("puzzle_hash_index").unwrap()
    }

    fn parent_coin_id_index_cf(&self) -> &ColumnFamily {
        self.db.cf_handle("parent_coin_id_index").unwrap()
    }

    fn hint_index_cf(&self) -> &ColumnFamily {
        self.db.cf_handle("hint_index").unwrap()
    }

    fn created_height_index_cf(&self) -> &ColumnFamily {
        self.db.cf_handle("created_height_index").unwrap()
    }

    fn spent_height_index_cf(&self) -> &ColumnFamily {
        self.db.cf_handle("spent_height_index").unwrap()
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let db = Database::new()?;

    let mut rng = rng();

    let instant = Instant::now();

    for i in 0..10000000 {
        if i % 100000 == 0 {
            println!("{i} in {:?}", instant.elapsed());
        }

        let coin = Coin::new(
            Bytes32::new(rng.random()),
            Bytes32::new(rng.random()),
            rng.random(),
        );

        let res1 = db.coin(coin.coin_id());
        assert!(res1.unwrap().is_none());

        let coin_id = coin.coin_id();

        let row = CoinRow {
            parent_coin_id: coin.parent_coin_info,
            puzzle_hash: coin.puzzle_hash,
            amount: coin.amount,
            created_height: if rng.random_bool(0.5) {
                Some(rng.random())
            } else {
                None
            },
            spent_height: if rng.random_bool(0.5) {
                Some(rng.random())
            } else {
                None
            },
            reward: false,
            hint: if rng.random_bool(0.5) {
                Some(Bytes32::new(rng.random()))
            } else {
                None
            },
            memos: None,
        };

        db.put_coin(coin_id, &row)?;

        db.add_to_puzzle_hash_index(coin.puzzle_hash, coin_id)?;
        db.add_to_parent_coin_id_index(coin.parent_coin_info, coin_id)?;
        if let Some(hint) = row.hint {
            db.add_to_hint_index(hint, coin_id)?;
        }
        if let Some(created_height) = row.created_height {
            db.add_to_created_height_index(created_height, coin_id)?;
        }
        if let Some(spent_height) = row.spent_height {
            db.add_to_spent_height_index(spent_height, coin_id)?;
        }
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
