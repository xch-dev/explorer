use anyhow::Result;
use chia::protocol::Bytes32;
use rocksdb::WriteBatch;
use xchdev_types::{BlockRecord, CoinRecord, CoinSpendRecord};

use crate::encode;

use super::Database;

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

    pub fn insert_block(&mut self, height: u32, row: &BlockRecord) -> Result<()> {
        self.batch
            .put_cf(self.db.blocks_cf(), height.to_be_bytes(), encode(row)?);

        self.batch.put_cf(
            self.db.block_hashes_cf(),
            row.header_hash.as_ref(),
            height.to_be_bytes(),
        );

        Ok(())
    }

    pub fn insert_coin(&mut self, row: &CoinRecord) -> Result<()> {
        let coin_id = row.coin.coin_id();

        self.batch.put_cf(self.db.coins_cf(), coin_id, encode(row)?);

        self.index_coin_height(row.created_height, coin_id);
        self.index_coin_parent(row.coin.parent_coin_info, coin_id);

        Ok(())
    }

    pub fn insert_coin_spend(&mut self, row: &CoinSpendRecord) -> Result<()> {
        let coin_id = row.coin.coin_id();

        self.batch
            .put_cf(self.db.coin_spends_cf(), coin_id, encode(row)?);

        self.index_coin_height(row.spent_height, coin_id);

        Ok(())
    }

    fn index_coin_height(&mut self, height: u32, coin_id: Bytes32) {
        let key = [height.to_be_bytes().as_ref(), coin_id.as_ref()].concat();
        self.batch.put_cf(self.db.coin_height_index_cf(), &key, []);
    }

    fn index_coin_parent(&mut self, parent_coin_id: Bytes32, coin_id: Bytes32) {
        let key = [parent_coin_id.as_ref(), coin_id.as_ref()].concat();
        self.batch
            .put_cf(self.db.coin_parent_hash_index_cf(), &key, []);
    }

    pub fn commit(self) -> Result<()> {
        self.db.0.write(self.batch)?;
        Ok(())
    }
}
