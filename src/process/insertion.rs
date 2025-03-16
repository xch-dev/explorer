use std::cmp::Ordering;

use chia::protocol::{Bytes32, Coin};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Insertion {
    Block {
        height: u32,
        header_hash: Bytes32,
    },
    TransactionBlock {
        height: u32,
        timestamp: u64,
        fees: u64,
        cost: u64,
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
            Self::TransactionBlock { .. } => 1,
            Self::Coin { .. } => 2,
            Self::SingletonCoin { .. } => 3,
            Self::CatCoin { .. } => 4,
            Self::CatTail { .. } => 5,
            Self::CoinSpend { .. } => 6,
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
