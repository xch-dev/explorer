use chia::{
    clvm_traits::FromClvm,
    protocol::{Bytes32, Coin, Program},
    puzzles::Memos,
};
use chia_wallet_sdk::{
    driver::{Cat, Did, Nft},
    prelude::CreateCoin,
    types::{run_puzzle, Condition},
};
use clvmr::{Allocator, NodePtr};
use xchdev_types::{CoinRecord, CoinSpendRecord, CoinType};

use crate::{BlockSpend, Result};

#[derive(Debug, Clone)]
pub struct ParsedBlockSpend {
    pub update: UpdatedCoin,
    pub additions: Vec<CoinRecord>,
}

#[derive(Debug, Clone)]
pub struct UpdatedCoin {
    pub spend: CoinSpendRecord,
    pub kind: CoinType,
}

impl UpdatedCoin {
    pub fn apply(self, coin_record: &mut CoinRecord) {
        coin_record.spent_height = Some(self.spend.spent_height);
        coin_record.kind = self.kind;
    }
}

#[derive(Debug, Default, Clone)]
struct Cache {
    child_cats: Vec<Cat>,
}

pub fn parse_block_spend(
    allocator: &mut Allocator,
    height: u32,
    spend: BlockSpend,
) -> Result<ParsedBlockSpend> {
    let (update, cache) = parse_updated_coin(allocator, height, spend)?;

    let mut result = ParsedBlockSpend {
        update,
        additions: Vec::new(),
    };

    let output = run_puzzle(allocator, spend.puzzle.ptr(), spend.solution)?;
    let conditions = Vec::<Condition>::from_clvm(allocator, output)?;

    for condition in conditions {
        let Some(create_coin) = condition.into_create_coin() else {
            continue;
        };

        parse_child_coin(allocator, &mut result, spend, &cache, create_coin)?;
    }

    Ok(result)
}

fn parse_updated_coin(
    allocator: &mut Allocator,
    height: u32,
    spend: BlockSpend,
) -> Result<(UpdatedCoin, Cache)> {
    let mut cache = Cache::default();

    let kind = if let Ok(Some(cat)) =
        Cat::parse(allocator, spend.coin, spend.puzzle, spend.solution)
    {
        cache.child_cats = Cat::parse_children(allocator, spend.coin, spend.puzzle, spend.solution)
            .ok()
            .flatten()
            .unwrap_or_default();

        let info = cat.0.info;

        CoinType::Cat {
            asset_id: info.asset_id,
            hidden_puzzle_hash: info.hidden_puzzle_hash,
            p2_puzzle_hash: info.p2_puzzle_hash,
        }
    } else if let Ok(Some(nft)) = Nft::parse(allocator, spend.coin, spend.puzzle, spend.solution) {
        let info = nft.0.info;

        CoinType::Nft {
            launcher_id: info.launcher_id,
            metadata: Program::from_clvm(allocator, info.metadata.ptr())?,
            metadata_updater_puzzle_hash: info.metadata_updater_puzzle_hash,
            current_owner: info.current_owner,
            royalty_puzzle_hash: info.royalty_puzzle_hash,
            royalty_basis_points: info.royalty_basis_points,
            p2_puzzle_hash: info.p2_puzzle_hash,
        }
    } else if let Ok(Some(did)) = Did::parse(allocator, spend.coin, spend.puzzle, spend.solution) {
        let info = did.0.info;

        CoinType::Did {
            launcher_id: info.launcher_id,
            metadata: Program::from_clvm(allocator, info.metadata.ptr())?,
            num_verifications_required: info.num_verifications_required,
            p2_puzzle_hash: info.p2_puzzle_hash,
            recovery_list_hash: info.recovery_list_hash,
        }
    } else {
        CoinType::Unknown
    };

    let update = UpdatedCoin {
        spend: CoinSpendRecord {
            coin: spend.coin,
            puzzle_reveal: Program::from_clvm(allocator, spend.puzzle.ptr())?,
            solution: Program::from_clvm(allocator, spend.solution)?,
            spent_height: height,
        },
        kind,
    };

    Ok((update, cache))
}

fn parse_child_coin(
    allocator: &mut Allocator,
    parsed: &mut ParsedBlockSpend,
    spend: BlockSpend,
    cache: &Cache,
    create_coin: CreateCoin<NodePtr>,
) -> Result<()> {
    let coin = Coin::new(
        spend.coin.coin_id(),
        create_coin.puzzle_hash,
        create_coin.amount,
    );

    let mut remaining_memos = if let Memos::Some(memos) = create_coin.memos {
        Some(memos)
    } else {
        None
    };

    let hint = if let Ok((hint, rest)) =
        <(Bytes32, NodePtr)>::from_clvm(allocator, remaining_memos.unwrap_or_default())
    {
        remaining_memos = Some(rest);
        Some(hint)
    } else {
        None
    };

    let kind = if let Some(cat) = cache.child_cats.iter().find(|cat| cat.coin == coin) {
        CoinType::Cat {
            asset_id: cat.info.asset_id,
            hidden_puzzle_hash: cat.info.hidden_puzzle_hash,
            p2_puzzle_hash: cat.info.p2_puzzle_hash,
        }
    } else if let Ok(Some(nft)) =
        Nft::parse_child(allocator, spend.coin, spend.puzzle, spend.solution)
    {
        CoinType::Nft {
            launcher_id: nft.info.launcher_id,
            metadata: Program::from_clvm(allocator, nft.info.metadata.ptr())?,
            metadata_updater_puzzle_hash: nft.info.metadata_updater_puzzle_hash,
            current_owner: nft.info.current_owner,
            royalty_puzzle_hash: nft.info.royalty_puzzle_hash,
            royalty_basis_points: nft.info.royalty_basis_points,
            p2_puzzle_hash: nft.info.p2_puzzle_hash,
        }
    } else if let Ok(Some(did)) =
        Did::parse_child(allocator, spend.coin, spend.puzzle, spend.solution, coin)
    {
        CoinType::Did {
            launcher_id: did.info.launcher_id,
            metadata: Program::from_clvm(allocator, did.info.metadata.ptr())?,
            num_verifications_required: did.info.num_verifications_required,
            p2_puzzle_hash: did.info.p2_puzzle_hash,
            recovery_list_hash: did.info.recovery_list_hash,
        }
    } else {
        CoinType::Unknown
    };

    parsed.additions.push(CoinRecord {
        coin,
        created_height: parsed.update.spend.spent_height,
        spent_height: None,
        hint,
        serialized_memos: remaining_memos
            .map(|memos| Program::from_clvm(allocator, memos))
            .transpose()?,
        kind,
    });

    Ok(())
}
