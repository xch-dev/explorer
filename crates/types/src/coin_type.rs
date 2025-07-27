use chia::protocol::{Bytes32, Program};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CoinType {
    Unknown,
    Reward,
    Cat {
        asset_id: Bytes32,
        hidden_puzzle_hash: Option<Bytes32>,
        p2_puzzle_hash: Bytes32,
    },
    Singleton {
        launcher_id: Bytes32,
        p2_puzzle_hash: Option<Bytes32>,
    },
    Nft {
        launcher_id: Bytes32,
        metadata: Program,
        metadata_updater_puzzle_hash: Bytes32,
        current_owner: Option<Bytes32>,
        royalty_puzzle_hash: Bytes32,
        royalty_basis_points: u16,
        p2_puzzle_hash: Bytes32,
    },
    Did {
        launcher_id: Bytes32,
        recovery_list_hash: Option<Bytes32>,
        num_verifications_required: u64,
        metadata: Program,
        p2_puzzle_hash: Bytes32,
    },
}
