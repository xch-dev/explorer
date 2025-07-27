use chia::protocol::Bytes32;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockRecord {
    pub height: u32,
    pub header_hash: Bytes32,
    pub weight: u128,
    pub total_iters: u128,
    pub farmer_puzzle_hash: Bytes32,
    pub pool_puzzle_hash: Option<Bytes32>,
    pub prev_block_hash: Bytes32,
    pub transaction_info: Option<TransactionInfo>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransactionInfo {
    pub timestamp: u64,
    pub fees: u64,
    pub cost: u64,
    pub additions: usize,
    pub removals: usize,
    pub prev_transaction_block_hash: Bytes32,
}
