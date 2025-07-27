use chia::{bls::PublicKey, protocol::Bytes32};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum P2PuzzleType {
    Unknown,
    Settlement,
    P2Delegated {
        public_key: PublicKey,
    },
    P2DelegatedOrHidden {
        synthetic_key: PublicKey,
    },
    MipsP2Singleton {
        nonce: usize,
        launcher_id: Bytes32,
    },
    Clawback {
        sender_puzzle_hash: Bytes32,
        receiver_puzzle_hash: Bytes32,
        seconds: u64,
    },
}
