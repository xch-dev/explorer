use std::cmp::Ordering;

use chia::protocol::Bytes32;

use crate::db::{BlockRow, CoinRow};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Insertion {
    Block {
        block: Box<BlockRow>,
    },
    Coin {
        coin: Box<CoinRow>,
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
            Self::CatTail { .. } => 2,
            Self::CoinSpend { .. } => 3,
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
