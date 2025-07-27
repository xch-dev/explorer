use std::{path::Path, sync::Arc};

use anyhow::Result;
use chia::protocol::Bytes32;
use rocksdb::{
    ColumnFamily, ColumnFamilyDescriptor, DBCompressionType, Direction, IteratorMode, Options,
    ReadOptions, SliceTransform, DB,
};
use xchdev_types::{BlockRecord, CoinRecord, CoinSpendRecord};

use crate::decode;

use super::Transaction;

#[derive(Clone)]
pub struct Database(pub(super) Arc<DB>);

impl Database {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        let cf_names = [
            "blocks",
            "block_hashes",
            "coins",
            "coin_height_index",
            "coin_parent_hash_index",
            "coin_spends",
        ];

        let mut options = Options::default();
        options.create_if_missing(true);
        options.create_missing_column_families(true);
        options.set_max_background_jobs(6);
        options.increase_parallelism(num_cpus::get() as i32);
        options.set_write_buffer_size(256 * 1024 * 1024);
        options.set_max_write_buffer_number(4);

        let cf_descriptors: Vec<_> = cf_names
            .iter()
            .map(|name| {
                let mut cf_opts = Options::default();
                cf_opts.set_compression_type(DBCompressionType::Lz4);

                if name.ends_with("_hash_index") {
                    cf_opts.set_prefix_extractor(SliceTransform::create_fixed_prefix(32));
                    cf_opts.set_memtable_prefix_bloom_ratio(0.1);
                    cf_opts.set_bloom_locality(1);
                    cf_opts.set_optimize_filters_for_hits(true);
                } else if name.ends_with("_height_index") {
                    cf_opts.set_prefix_extractor(SliceTransform::create_fixed_prefix(4));
                    cf_opts.set_memtable_prefix_bloom_ratio(0.1);
                    cf_opts.set_bloom_locality(1);
                    cf_opts.set_optimize_filters_for_hits(true);
                } else {
                    cf_opts.set_bottommost_compression_type(DBCompressionType::Zstd);
                }

                ColumnFamilyDescriptor::new(name.to_string(), cf_opts)
            })
            .collect();

        // Open database with column families
        let db = DB::open_cf_descriptors(&options, path, cf_descriptors)?;

        Ok(Self(Arc::new(db)))
    }

    pub fn peak(&self) -> Result<Option<(u32, BlockRecord)>> {
        let Some((height, block)) = self
            .0
            .iterator_cf(self.blocks_cf(), IteratorMode::End)
            .next()
            .transpose()?
        else {
            return Ok(None);
        };

        let height = u32::from_be_bytes((*height).try_into().unwrap());
        let block = decode::<BlockRecord>(&block)?;

        Ok(Some((height, block)))
    }

    pub fn block(&self, height: u32) -> Result<Option<BlockRecord>> {
        self.0
            .get_cf(self.blocks_cf(), height.to_be_bytes())?
            .map(|bytes| decode::<BlockRecord>(&bytes))
            .transpose()
    }

    pub fn blocks(
        &self,
        start_height: Option<u32>,
        direction: Direction,
        limit: usize,
    ) -> Result<Vec<(u32, BlockRecord)>> {
        if limit == 0 {
            return Ok(Vec::new());
        }

        let bytes;
        let mode = if let Some(start_height) = start_height {
            bytes = start_height.to_be_bytes();
            IteratorMode::From(&bytes, direction)
        } else if matches!(direction, Direction::Forward) {
            IteratorMode::Start
        } else {
            IteratorMode::End
        };

        self.0
            .iterator_cf(self.blocks_cf(), mode)
            .take(limit)
            .map(|item| {
                let (height, block) = item?;
                let height = u32::from_be_bytes((*height).try_into().unwrap());
                let block = decode::<BlockRecord>(&block)?;
                Ok((height, block))
            })
            .collect()
    }

    pub fn block_height(&self, hash: Bytes32) -> Result<Option<u32>> {
        let height = self.0.get_cf(self.block_hashes_cf(), hash.as_ref())?;
        Ok(height.map(|bytes| u32::from_be_bytes(bytes.try_into().unwrap())))
    }

    pub fn coin(&self, coin_id: Bytes32) -> Result<Option<CoinRecord>> {
        self.0
            .get_cf(self.coins_cf(), coin_id.as_ref())?
            .map(|bytes| decode::<CoinRecord>(&bytes))
            .transpose()
    }

    pub fn coins_by_height(&self, height: u32) -> Result<Vec<Bytes32>> {
        self.0
            .iterator_cf_opt(
                self.coin_height_index_cf(),
                index_opts(),
                IteratorMode::From(
                    &[height.to_be_bytes().as_ref(), &[0; 32]].concat(),
                    Direction::Forward,
                ),
            )
            .map(|item| Ok(item?.0[4..].try_into().unwrap()))
            .collect()
    }

    pub fn coins_by_parent(&self, parent_hash: Bytes32) -> Result<Vec<Bytes32>> {
        self.0
            .iterator_cf_opt(
                self.coin_parent_hash_index_cf(),
                index_opts(),
                IteratorMode::From(parent_hash.as_ref(), Direction::Forward),
            )
            .map(|item| Ok(item?.0[32..].try_into().unwrap()))
            .collect()
    }

    pub fn coin_spend(&self, coin_id: Bytes32) -> Result<Option<CoinSpendRecord>> {
        self.0
            .get_cf(self.coin_spends_cf(), coin_id.as_ref())?
            .map(|bytes| decode::<CoinSpendRecord>(&bytes))
            .transpose()
    }

    pub(super) fn blocks_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("blocks").unwrap()
    }

    pub(super) fn block_hashes_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("block_hashes").unwrap()
    }

    pub(super) fn coins_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coins").unwrap()
    }

    pub(super) fn coin_height_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coin_height_index").unwrap()
    }

    pub(super) fn coin_parent_hash_index_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coin_parent_hash_index").unwrap()
    }

    pub(super) fn coin_spends_cf(&self) -> &ColumnFamily {
        self.0.cf_handle("coin_spends").unwrap()
    }

    pub fn transaction(&self) -> Transaction {
        Transaction::new(self)
    }
}

fn index_opts() -> ReadOptions {
    let mut read_opts = ReadOptions::default();
    read_opts.set_prefix_same_as_start(true);
    read_opts
}
