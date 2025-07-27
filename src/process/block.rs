use std::collections::HashMap;

use chia::{
    clvm_utils::tree_hash,
    consensus::{
        get_puzzle_and_solution::parse_coin_spend,
        run_block_generator::setup_generator_args,
        validation_error::{first, next, ValidationErr},
    },
    protocol::{Bytes32, Coin, FullBlock},
};
use chia_wallet_sdk::types::run_puzzle;
use clvmr::{serde::node_from_bytes_backrefs, Allocator, NodePtr};
use rayon::iter::{IntoParallelIterator, ParallelIterator};

use crate::{
    db::{BlockRow, CoinKind, CoinRow, TransactionInfo},
    process::Insertions,
};

use super::process_coin_spend;

pub fn process_blocks(blocks: Vec<FullBlock>, refs: HashMap<u32, FullBlock>) -> Insertions {
    let mut insertions = Insertions::new();

    blocks
        .into_par_iter()
        .map(|block| process_block(block, &refs))
        .collect::<Vec<_>>()
        .into_iter()
        .for_each(|item| insertions.extend(item));

    insertions
}

fn process_block(block: FullBlock, refs: &HashMap<u32, FullBlock>) -> Insertions {
    let mut insertions = Insertions::new();

    for coin in block.get_included_reward_coins() {
        insertions.coins.insert(
            coin.coin_id(),
            CoinRow {
                coin,
                created_height: block.height(),
                spend: None,
                hint: None,
                memos: None,
                kind: Some(CoinKind::Reward),
                p2_puzzle: None,
            },
        );
    }

    let mut additions = 0;
    let mut removals = 0;

    if let Some(generator_blob) = &block.transactions_generator {
        let mut allocator = Allocator::new();

        let generator = node_from_bytes_backrefs(&mut allocator, generator_blob).unwrap();

        let mut block_refs = Vec::new();

        for ref_block in &block.transactions_generator_ref_list {
            let Some(ref_block) = refs.get(ref_block) else {
                continue;
            };
            block_refs.push(ref_block.transactions_generator.as_deref().unwrap());
        }

        let args = setup_generator_args(&mut allocator, block_refs).expect("setup_generator_args");
        let result = run_puzzle(&mut allocator, generator, args).unwrap();
        let spends = parse_spends(&allocator, result).unwrap();

        for (parent, amount, puzzle, solution) in spends {
            let puzzle_hash = tree_hash(&allocator, puzzle);

            removals += 1;
            additions += process_coin_spend(
                &mut insertions,
                &mut allocator,
                block.height(),
                Coin::new(parent, puzzle_hash.into(), amount),
                puzzle,
                solution,
            );
        }
    }

    let height = block.height();

    insertions.blocks.insert(
        height,
        BlockRow {
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
                block.foliage_transaction_block,
            ) {
                Some(TransactionInfo {
                    timestamp: tx_block.timestamp,
                    fees: tx_info.fees,
                    cost: tx_info.cost,
                    additions,
                    removals,
                    prev_transaction_block_hash: tx_block.prev_transaction_block_hash,
                })
            } else {
                None
            },
        },
    );

    insertions
}

fn parse_spends(
    a: &Allocator,
    generator_result: NodePtr,
) -> Result<Vec<(Bytes32, u64, NodePtr, NodePtr)>, ValidationErr> {
    let mut iter = first(a, generator_result)?;
    let mut spends = Vec::new();

    while let Some((coin_spend, next)) = next(a, iter)? {
        iter = next;
        let (parent, amount, puzzle, solution) = parse_coin_spend(a, coin_spend)?;
        spends.push((
            parent.as_ref().try_into().unwrap(),
            amount,
            puzzle,
            solution,
        ));
    }

    Ok(spends)
}
