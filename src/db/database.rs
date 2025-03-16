use std::sync::Arc;

use anyhow::Result;
use chia::protocol::Bytes32;
use rocksdb::{
    ColumnFamily, ColumnFamilyDescriptor, Direction, IteratorMode, MergeOperands, Options, DB,
};

use super::{BlockRow, CoinRow, Transaction};

struct Column {
    name: &'static str,
    prefix: Option<usize>,
}

#[derive(Clone)]
pub struct Database(pub(super) Arc<DB>);

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
        Ok(block
            .map(|bytes| bincode::deserialize::<BlockRow>(&bytes))
            .transpose()?)
    }

    pub fn blocks_range(
        &self,
        start_height: u32,
        end_height: u32,
        direction: Direction,
    ) -> Result<Vec<BlockRow>> {
        if start_height > end_height {
            return Ok(Vec::new());
        }

        let end_height = end_height.min(self.peak_height()?.unwrap_or(0));

        let mut result = Vec::new();

        let start_key = match direction {
            Direction::Forward => start_height.to_be_bytes(),
            Direction::Reverse => end_height.to_be_bytes(),
        };

        let iter = self
            .0
            .iterator_cf(self.block_cf(), IteratorMode::From(&start_key, direction));

        for item in iter {
            let (key, value) = item?;

            if key.len() != 4 {
                continue;
            }

            let height = u32::from_be_bytes(key[..].try_into().unwrap());

            match direction {
                Direction::Forward => {
                    if height > end_height {
                        break;
                    }
                }
                Direction::Reverse => {
                    if height < start_height {
                        break;
                    }
                }
            }

            result.push(bincode::deserialize::<BlockRow>(&value)?);
        }

        Ok(result)
    }

    pub fn coin(&self, coin_id: Bytes32) -> Result<Option<CoinRow>> {
        Ok(self
            .0
            .get_cf(self.coin_cf(), coin_id)?
            .map(|bytes| bincode::deserialize::<CoinRow>(&bytes))
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

    pub(super) fn block_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("blocks").unwrap()
    }

    pub(super) fn coin_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coins").unwrap()
    }

    pub(super) fn tail_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("tails").unwrap()
    }

    pub(super) fn coin_spend_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coin_spends").unwrap()
    }

    pub(super) fn puzzle_hash_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("puzzle_hash_index").unwrap()
    }

    pub(super) fn parent_coin_id_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("parent_coin_id_index").unwrap()
    }

    pub(super) fn hint_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("hint_index").unwrap()
    }

    pub(super) fn created_height_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("created_height_index").unwrap()
    }

    pub(super) fn spent_height_index_cf(&self) -> &ColumnFamily {
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
