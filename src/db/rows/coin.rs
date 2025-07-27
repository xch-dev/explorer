use chia::protocol::{Bytes32, Coin, Program};
use chia_wallet_sdk::driver::{CatInfo, DidInfo, NftInfo, SpendContext};
use indexmap::IndexSet;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoinRow {
    pub coin: Coin,
    pub created_height: u32,
    pub spend: Option<CoinSpend>,
    pub hint: Option<Bytes32>,
    pub memos: Option<Program>,
    pub kind: Option<CoinKind>,
    pub p2_puzzle: Option<P2Puzzle>,
}

impl CoinRow {
    pub fn puzzle_hashes(&self) -> Vec<Bytes32> {
        let mut hashes = IndexSet::new();

        // We want to be able to lookup by the actual coin's puzzle hash
        hashes.insert(self.coin.puzzle_hash);

        // If you want to do anything custom with a hint, this will enable lookups for that
        hashes.extend(self.hint);

        // However, even if a coin isn't hinted, we can look it up by the p2 puzzle hash
        hashes.extend(self.p2_puzzle_hash());

        // We should also be able to lookup by the inner puzzle hash just in case
        hashes.extend(self.inner_puzzle_hash());

        // If the coin is a clawback, we can lookup by the sender and receiver custody p2 puzzle hashes
        if let Some(P2Puzzle::ClawbackV2 {
            sender_puzzle_hash,
            receiver_puzzle_hash,
            ..
        }) = &self.p2_puzzle
        {
            hashes.insert(*sender_puzzle_hash);
            hashes.insert(*receiver_puzzle_hash);
        }

        // Finally, CAT coins and singleton coins can be looked up by asset id or launcher id respectively
        // This allows quick indexing for latest singleton coins, for example, without needing a new column family
        hashes.extend(self.outer_puzzle_id());

        hashes.into_iter().collect()
    }

    fn p2_puzzle_hash(&self) -> Option<Bytes32> {
        Some(match self.kind.as_ref()? {
            CoinKind::Cat { p2_puzzle_hash, .. }
            | CoinKind::Nft { p2_puzzle_hash, .. }
            | CoinKind::Did { p2_puzzle_hash, .. } => *p2_puzzle_hash,
            _ => return None,
        })
    }

    fn inner_puzzle_hash(&self) -> Option<Bytes32> {
        let mut ctx = SpendContext::new();

        Some(match self.kind.as_ref()? {
            CoinKind::Reward | CoinKind::Singleton { .. } => return None,
            CoinKind::Cat {
                asset_id,
                hidden_puzzle_hash,
                p2_puzzle_hash,
                ..
            } => CatInfo::new(*asset_id, *hidden_puzzle_hash, *p2_puzzle_hash)
                .inner_puzzle_hash()
                .into(),
            CoinKind::Did {
                launcher_id,
                recovery_list_hash,
                num_verifications_required,
                metadata,
                p2_puzzle_hash,
                ..
            } => DidInfo::new(
                *launcher_id,
                *recovery_list_hash,
                *num_verifications_required,
                ctx.alloc_hashed(&metadata).unwrap(),
                *p2_puzzle_hash,
            )
            .inner_puzzle_hash()
            .into(),
            CoinKind::Nft {
                launcher_id,
                metadata,
                metadata_updater_puzzle_hash,
                current_owner,
                royalty_puzzle_hash,
                royalty_basis_points,
                p2_puzzle_hash,
                ..
            } => NftInfo::new(
                *launcher_id,
                ctx.alloc_hashed(&metadata).unwrap(),
                *metadata_updater_puzzle_hash,
                *current_owner,
                *royalty_puzzle_hash,
                *royalty_basis_points,
                *p2_puzzle_hash,
            )
            .inner_puzzle_hash()
            .into(),
        })
    }

    fn outer_puzzle_id(&self) -> Option<Bytes32> {
        Some(match self.kind.as_ref()? {
            CoinKind::Cat { asset_id: id, .. }
            | CoinKind::Singleton {
                launcher_id: id, ..
            }
            | CoinKind::Nft {
                launcher_id: id, ..
            }
            | CoinKind::Did {
                launcher_id: id, ..
            } => *id,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoinSpend {
    pub spent_height: u32,
    pub puzzle_reveal: Program,
    pub solution: Program,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CoinKind {
    Reward,
    Cat {
        asset_id: Bytes32,
        hidden_puzzle_hash: Option<Bytes32>,
        p2_puzzle_hash: Bytes32,
        lineage_proof: Option<CatLineageProof>,
    },
    Singleton {
        launcher_id: Bytes32,
        lineage_proof: SingletonLineageProof,
    },
    Nft {
        launcher_id: Bytes32,
        metadata: Program,
        metadata_updater_puzzle_hash: Bytes32,
        current_owner: Option<Bytes32>,
        royalty_puzzle_hash: Bytes32,
        royalty_basis_points: u16,
        p2_puzzle_hash: Bytes32,
        lineage_proof: SingletonLineageProof,
    },
    Did {
        launcher_id: Bytes32,
        recovery_list_hash: Option<Bytes32>,
        num_verifications_required: u64,
        metadata: Program,
        p2_puzzle_hash: Bytes32,
        lineage_proof: SingletonLineageProof,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SingletonLineageProof {
    pub parent_parent_coin_info: Bytes32,
    pub parent_inner_puzzle_hash: Option<Bytes32>,
    pub parent_amount: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatLineageProof {
    pub parent_parent_coin_info: Bytes32,
    pub parent_inner_puzzle_hash: Bytes32,
    pub parent_amount: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum P2Puzzle {
    ClawbackV2 {
        sender_puzzle_hash: Bytes32,
        receiver_puzzle_hash: Bytes32,
        seconds: u64,
        amount: u64,
        hinted: bool,
    },
}
