use chia::protocol::{Bytes32, Coin, Program};
use serde::{Deserialize, Serialize};

use crate::CoinType;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoinRecord {
    pub coin: Coin,
    pub created_height: u32,
    pub spent_height: Option<u32>,
    pub hint: Option<Bytes32>,
    pub serialized_memos: Program,
    #[serde(flatten)]
    pub kind: CoinType,
}
