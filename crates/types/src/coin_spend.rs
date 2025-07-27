use chia::protocol::{Coin, Program};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoinSpendRecord {
    pub coin: Coin,
    pub puzzle_reveal: Program,
    pub solution: Program,
    pub spent_height: u32,
}
