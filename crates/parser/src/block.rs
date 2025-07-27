use std::collections::HashMap;

use chia::{
    consensus::{
        get_puzzle_and_solution::parse_coin_spend,
        run_block_generator::setup_generator_args,
        validation_error::{first, next},
    },
    protocol::{Bytes32, Coin, FullBlock},
};
use chia_wallet_sdk::{driver::Puzzle, types::run_puzzle};
use clvmr::{serde::node_from_bytes_backrefs, Allocator, NodePtr};

use crate::{Error, Result};

#[derive(Debug, Clone)]
pub struct ParsedBlock {
    pub height: u32,
    pub header_hash: Bytes32,
    pub weight: u128,
    pub total_iters: u128,
    pub farmer_puzzle_hash: Bytes32,
    pub pool_puzzle_hash: Option<Bytes32>,
    pub prev_block_hash: Bytes32,
    pub transaction_info: Option<ParsedTransactionInfo>,
    pub reward_coins: Vec<Coin>,
}

#[derive(Debug, Clone)]
pub struct ParsedTransactionInfo {
    pub timestamp: u64,
    pub fees: u64,
    pub cost: u64,
    pub spends: Vec<BlockSpend>,
    pub prev_transaction_block_hash: Bytes32,
}

#[derive(Debug, Clone, Copy)]
pub struct BlockSpend {
    pub coin: Coin,
    pub puzzle: Puzzle,
    pub solution: NodePtr,
}

pub fn parse_block(
    allocator: &mut Allocator,
    block: &FullBlock,
    refs: &HashMap<u32, FullBlock>,
) -> Result<ParsedBlock> {
    let mut block_spends = Vec::new();

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
        let spends = parse_block_spends(allocator, result)?;

        for (parent, amount, puzzle, solution) in spends {
            let puzzle = Puzzle::parse(allocator, puzzle);

            block_spends.push(BlockSpend {
                coin: Coin::new(parent, puzzle.curried_puzzle_hash().into(), amount),
                puzzle,
                solution,
            });
        }
    }

    Ok(ParsedBlock {
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
            Some(ParsedTransactionInfo {
                timestamp: tx_block.timestamp,
                fees: tx_info.fees,
                cost: tx_info.cost,
                spends: block_spends,
                prev_transaction_block_hash: tx_block.prev_transaction_block_hash,
            })
        } else {
            None
        },
        reward_coins: block.get_included_reward_coins(),
    })
}

fn parse_block_spends(
    allocator: &Allocator,
    generator_result: NodePtr,
) -> Result<Vec<(Bytes32, u64, NodePtr, NodePtr)>> {
    let mut iter = first(allocator, generator_result)?;
    let mut spends = Vec::new();

    while let Some((coin_spend, next)) = next(allocator, iter)? {
        iter = next;
        let (parent, amount, puzzle, solution) = parse_coin_spend(allocator, coin_spend)?;
        spends.push((parent.as_ref().try_into()?, amount, puzzle, solution));
    }

    Ok(spends)
}
