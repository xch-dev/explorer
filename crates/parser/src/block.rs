use std::collections::HashMap;

use chia::{
    consensus::{
        get_puzzle_and_solution::parse_coin_spend as parse_consensus_spend,
        run_block_generator::setup_generator_args,
        validation_error::{first, next},
    },
    protocol::{Coin, FullBlock},
};
use chia_wallet_sdk::{driver::Puzzle, types::run_puzzle};
use clvmr::{serde::node_from_bytes_backrefs, Allocator, NodePtr};
use xchdev_types::{BlockRecord, CoinRecord, CoinType, TransactionInfo};

use crate::{parse_block_spends, Error, Result, UpdatedCoin};

#[derive(Debug, Clone, Copy)]
pub struct BlockSpend {
    pub coin: Coin,
    pub puzzle: Puzzle,
    pub solution: NodePtr,
}

#[derive(Debug, Clone)]
pub struct ParsedBlock {
    pub block_record: BlockRecord,
    pub updates: Vec<UpdatedCoin>,
    pub additions: Vec<CoinRecord>,
}

pub fn parse_block(
    allocator: &mut Allocator,
    block: &FullBlock,
    refs: &HashMap<u32, FullBlock>,
) -> Result<ParsedBlock> {
    let mut updates = Vec::new();
    let mut additions = Vec::new();

    for coin in block.get_included_reward_coins() {
        additions.push(CoinRecord {
            coin,
            created_height: block.height(),
            spent_height: None,
            hint: None,
            serialized_memos: None,
            kind: CoinType::Reward,
        });
    }

    if let Some(generator_blob) = &block.transactions_generator {
        let generator = node_from_bytes_backrefs(allocator, generator_blob)?;

        let mut block_refs = Vec::new();

        for &ref_block in &block.transactions_generator_ref_list {
            let Some(generator) = refs
                .get(&ref_block)
                .and_then(|block| block.transactions_generator.as_deref())
            else {
                return Err(Error::MissingReferenceBlock(ref_block));
            };
            block_refs.push(generator);
        }

        let args = setup_generator_args(allocator, block_refs)?;
        let result = run_puzzle(allocator, generator, args)?;

        let mut iter = first(allocator, result)?;
        let mut spends = Vec::new();

        while let Some((coin_spend, next)) = next(allocator, iter)? {
            iter = next;
            let (parent, amount, puzzle, solution) = parse_consensus_spend(allocator, coin_spend)?;
            let parent = parent.as_ref().try_into()?;
            let puzzle = Puzzle::parse(allocator, puzzle);
            spends.push(BlockSpend {
                coin: Coin::new(parent, puzzle.curried_puzzle_hash().into(), amount),
                puzzle,
                solution,
            });
        }

        let spends = parse_block_spends(allocator, block.height(), spends)?;
        updates.extend(spends.updates);
        additions.extend(spends.additions);
    }

    let block_record = BlockRecord {
        height: block.height(),
        header_hash: block.header_hash(),
        weight: block.weight(),
        total_iters: block.total_iters(),
        farmer_puzzle_hash: block.foliage.foliage_block_data.farmer_reward_puzzle_hash,
        pool_puzzle_hash: block
            .reward_chain_block
            .proof_of_space
            .pool_contract_puzzle_hash,
        prev_block_hash: block.prev_header_hash(),
        transaction_info: if let (Some(tx_info), Some(tx_block)) = (
            block.transactions_info.as_ref(),
            block.foliage_transaction_block.as_ref(),
        ) {
            Some(TransactionInfo {
                timestamp: tx_block.timestamp,
                fees: tx_info.fees,
                cost: tx_info.cost,
                additions: additions.len(),
                removals: updates.len(),
                prev_transaction_block_hash: tx_block.prev_transaction_block_hash,
            })
        } else {
            None
        },
    };

    Ok(ParsedBlock {
        block_record,
        updates,
        additions,
    })
}
