use chia::protocol::{Bytes, Bytes32};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockRow {
    pub header_hash: Bytes32,
    pub weight: u128,
    pub total_iters: u128,
    pub prev_block_hash: Bytes32,
    pub farmer_puzzle_hash: Bytes32,
    pub pool_puzzle_hash: Option<Bytes32>,
    pub transaction_info: Option<TransactionInfo>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransactionInfo {
    pub timestamp: u64,
    pub fees: u64,
    pub cost: u64,
    pub additions: u32,
    pub removals: u32,
    pub prev_transaction_block_hash: Bytes32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoinRow {
    pub parent_coin_id: Bytes32,
    pub puzzle_hash: Bytes32,
    pub amount: u64,
    pub created_height: u32,
    pub hint: Option<Bytes32>,
    pub memos: Option<Bytes>,
    #[serde(rename = "type", flatten)]
    pub kind: CoinType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CoinType {
    Reward,
    Unknown,
    Cat {
        asset_id: Bytes32,
        inner_puzzle_hash: Bytes32,
        lineage_proof: LineageProof,
    },
    Singleton {
        launcher_id: Bytes32,
        lineage_proof: LineageProof,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineageProof {
    pub parent_parent_coin_id: Bytes32,
    pub parent_inner_puzzle_hash: Option<Bytes32>,
    pub parent_amount: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoinSpendRow {
    pub spent_height: u32,
    pub puzzle_reveal: Bytes,
    pub solution: Bytes,
}
