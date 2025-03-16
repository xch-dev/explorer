use std::collections::HashMap;

use chia::{
    clvm_utils::tree_hash,
    consensus::gen::{
        get_puzzle_and_solution::parse_coin_spend,
        run_block_generator::setup_generator_args,
        validation_error::{first, next, ValidationErr},
    },
    protocol::{Coin, CoinSpend, FullBlock},
};
use chia_wallet_sdk::types::run_puzzle;
use clvmr::{
    serde::{node_from_bytes_backrefs, node_to_bytes},
    Allocator, Atom, NodePtr,
};
use rayon::iter::{IntoParallelIterator, ParallelIterator};

use super::{process_coin_spend, Insertion};

pub fn process_blocks(blocks: Vec<FullBlock>, refs: HashMap<u32, FullBlock>) -> Vec<Insertion> {
    blocks
        .into_par_iter()
        .map(|block| process_block(block, &refs))
        .flatten()
        .collect()
}

fn process_block(block: FullBlock, refs: &HashMap<u32, FullBlock>) -> Vec<Insertion> {
    let mut insertions = Vec::new();

    insertions.push(Insertion::Block {
        height: block.height(),
        header_hash: block.header_hash(),
    });

    if let Some(info) = &block.transactions_info {
        insertions.push(Insertion::TransactionBlock {
            height: block.height(),
            timestamp: block.foliage_transaction_block.as_ref().unwrap().timestamp,
            fees: info.fees,
            cost: info.cost,
        });
    }

    for coin in block.get_included_reward_coins() {
        insertions.push(Insertion::Coin {
            coin,
            hint: None,
            memos: None,
            created_height: block.height(),
            reward: true,
        });
    }

    let Some(generator_blob) = &block.transactions_generator else {
        return insertions;
    };

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

    insertions.extend(
        spends
            .into_par_iter()
            .map(|(parent, amount, puzzle, solution)| {
                let parent_coin_info = parent.as_ref().try_into().unwrap();
                let puzzle_hash = tree_hash(&allocator, puzzle);
                let coin_spend = CoinSpend::new(
                    Coin::new(parent_coin_info, puzzle_hash.into(), amount),
                    node_to_bytes(&allocator, puzzle).unwrap().into(),
                    node_to_bytes(&allocator, solution).unwrap().into(),
                );
                process_coin_spend(block.height(), coin_spend)
            })
            .flatten()
            .collect::<Vec<_>>(),
    );

    insertions
}

fn parse_spends(
    a: &Allocator,
    generator_result: NodePtr,
) -> Result<Vec<(Atom<'_>, u64, NodePtr, NodePtr)>, ValidationErr> {
    let mut iter = first(a, generator_result)?;
    let mut spends = Vec::new();

    while let Some((coin_spend, next)) = next(a, iter)? {
        iter = next;
        spends.push(parse_coin_spend(a, coin_spend)?);
    }

    Ok(spends)
}
