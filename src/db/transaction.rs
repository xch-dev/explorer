use anyhow::Result;
use chia::protocol::{Bytes, Bytes32};
use rocksdb::WriteBatch;

use super::{BlockRow, CoinRow, CoinSpendRow, Database};

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
            bincode::serialize(block)?,
        );
        Ok(())
    }

    pub fn put_coin(&mut self, coin: &CoinRow) -> Result<()> {
        self.batch
            .put_cf(self.db.coin_cf(), coin.coin_id, bincode::serialize(coin)?);

        self.add_to_puzzle_hash_index(coin.puzzle_hash, coin.coin_id)?;
        self.add_to_parent_coin_id_index(coin.parent_coin_id, coin.coin_id)?;

        if let Some(hint) = coin.hint {
            self.add_to_hint_index(hint, coin.coin_id)?;
        }

        self.add_to_created_height_index(coin.created_height, coin.coin_id)?;

        Ok(())
    }

    pub fn put_tail(&mut self, asset_id: Bytes32, tail: &Bytes) -> Result<()> {
        self.batch.put_cf(self.db.tail_cf(), asset_id, tail);
        Ok(())
    }

    pub fn put_coin_spend(&mut self, coin_id: Bytes32, coin_spend: &CoinSpendRow) -> Result<()> {
        self.batch.put_cf(
            self.db.coin_spend_cf(),
            coin_id,
            bincode::serialize(coin_spend)?,
        );

        self.add_to_spent_height_index(coin_spend.spent_height, coin_id)?;

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
