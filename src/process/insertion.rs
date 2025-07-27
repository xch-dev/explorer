use chia::protocol::{Bytes32, Program};
use indexmap::IndexMap;

use crate::db::{BlockRow, CoinKind, CoinRow, P2Puzzle};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Insertions {
    pub blocks: IndexMap<u32, BlockRow>,
    pub coins: IndexMap<Bytes32, CoinRow>,
    pub tails: IndexMap<Bytes32, Program>,
    pub coin_spends: IndexMap<Bytes32, CoinSpendInsertion>,
}

impl Insertions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn extend(&mut self, other: Insertions) {
        self.blocks.extend(other.blocks);
        self.coins.extend(other.coins);
        self.tails.extend(other.tails);
        self.coin_spends.extend(other.coin_spends);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoinSpendInsertion {
    pub spent_height: u32,
    pub puzzle_reveal: Program,
    pub solution: Program,
    pub kind: Option<CoinKind>,
    pub p2_puzzle: Option<P2Puzzle>,
}
