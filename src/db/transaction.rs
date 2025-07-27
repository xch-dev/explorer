use anyhow::{bail, Result};
use chia::protocol::Bytes32;
use rocksdb::WriteBatch;

use crate::db::{CoinKind, CoinRow, CoinSpend, P2Puzzle};

use super::{BlockRow, Database};

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

    pub fn create_block(&mut self, height: u32, row: &BlockRow) -> Result<()> {
        self.batch
            .put_cf(self.db.blocks_cf(), height.to_be_bytes(), pot::to_vec(row)?);

        self.batch.put_cf(
            self.db.block_hashes_cf(),
            row.header_hash.as_ref(),
            height.to_be_bytes(),
        );

        Ok(())
    }

    pub fn create_coin(&mut self, row: &CoinRow) -> Result<()> {
        let coin_id = row.coin.coin_id();

        self.batch
            .put_cf(self.db.coins_cf(), coin_id, pot::to_vec(row)?);

        self.put_coin_height_index(row.created_height, coin_id);

        self.put_coin_parent_hash_index(row.coin.parent_coin_info, coin_id);

        for puzzle_hash in row.puzzle_hashes() {
            self.put_coin_puzzle_hash_index(puzzle_hash, row.created_height, coin_id);
        }

        if let Some(spend) = &row.spend {
            self.put_coin_height_index(spend.spent_height, coin_id);

            for puzzle_hash in row.puzzle_hashes() {
                self.put_coin_puzzle_hash_index(puzzle_hash, spend.spent_height, coin_id);
            }
        }

        Ok(())
    }

    pub fn spend_coin(
        &mut self,
        coin_id: Bytes32,
        spend: CoinSpend,
        kind: Option<CoinKind>,
        p2_puzzle: Option<P2Puzzle>,
    ) -> Result<()> {
        let Some(row) = self.db.0.get_cf(self.db.coins_cf(), coin_id.as_ref())? else {
            bail!("coin not found");
        };

        let mut row: CoinRow = pot::from_slice(&row)?;

        let height = spend.spent_height;

        row.spend = Some(spend);

        if let Some(kind) = kind {
            row.kind = Some(kind);
        }

        if let Some(p2_puzzle) = p2_puzzle {
            row.p2_puzzle = Some(p2_puzzle);
        }

        self.batch
            .put_cf(self.db.coins_cf(), coin_id, pot::to_vec(&row)?);

        self.put_coin_height_index(height, coin_id);

        for puzzle_hash in row.puzzle_hashes() {
            self.put_coin_puzzle_hash_index(puzzle_hash, height, coin_id);
        }

        Ok(())
    }

    fn put_coin_height_index(&mut self, height: u32, coin_id: Bytes32) {
        let key = [height.to_be_bytes().as_ref(), coin_id.as_ref()].concat();
        self.batch.put_cf(self.db.coin_height_index_cf(), &key, []);
    }

    fn put_coin_puzzle_hash_index(&mut self, puzzle_hash: Bytes32, height: u32, coin_id: Bytes32) {
        let key = [
            puzzle_hash.as_ref(),
            height.to_be_bytes().as_ref(),
            coin_id.as_ref(),
        ]
        .concat();
        self.batch
            .put_cf(self.db.coin_puzzle_hash_index_cf(), &key, []);
    }

    fn put_coin_parent_hash_index(&mut self, parent_coin_id: Bytes32, coin_id: Bytes32) {
        let key = [parent_coin_id.as_ref(), coin_id.as_ref()].concat();
        self.batch
            .put_cf(self.db.coin_parent_hash_index_cf(), &key, []);
    }

    pub fn commit(self) -> Result<()> {
        self.db.0.write(self.batch)?;
        Ok(())
    }
}
