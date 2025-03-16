use std::cmp::Ordering;

use chia::protocol::{Bytes32, Coin};

use crate::db::BlockRow;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Insertion {
    Block {
        block: Box<BlockRow>,
    },
    Coin {
        coin: Coin,
        hint: Option<Bytes32>,
        memos: Option<Vec<u8>>,
        created_height: u32,
        reward: bool,
    },
    SingletonCoin {
        coin_id: Bytes32,
        launcher_id: Bytes32,
        inner_puzzle_hash: Bytes32,
    },
    CatCoin {
        coin_id: Bytes32,
        asset_id: Bytes32,
        inner_puzzle_hash: Bytes32,
    },
    CatTail {
        asset_id: Bytes32,
        tail: Vec<u8>,
    },
    CoinSpend {
        coin_id: Bytes32,
        puzzle_reveal: Vec<u8>,
        solution: Vec<u8>,
        spent_height: u32,
    },
}

impl Insertion {
    fn order(&self) -> u8 {
        match self {
            Self::Block { .. } => 0,
            Self::Coin { .. } => 1,
            Self::SingletonCoin { .. } => 2,
            Self::CatCoin { .. } => 3,
            Self::CatTail { .. } => 4,
            Self::CoinSpend { .. } => 5,
        }
    }
}

impl PartialOrd for Insertion {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Insertion {
    fn cmp(&self, other: &Self) -> Ordering {
        self.order().cmp(&other.order())
    }
}
