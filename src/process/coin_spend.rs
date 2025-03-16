use chia::{
    clvm_traits::FromClvm,
    protocol::{Bytes32, Coin, CoinSpend, Program},
    puzzles::{
        cat::{CatArgs, CatSolution},
        singleton::{LauncherSolution, SingletonArgs, SingletonSolution},
    },
};
use chia_puzzles::{CAT_PUZZLE_HASH, SINGLETON_LAUNCHER_HASH, SINGLETON_TOP_LAYER_V1_1_HASH};
use chia_wallet_sdk::{
    driver::Puzzle,
    types::{run_puzzle, Condition},
};
use clvmr::{
    serde::{node_from_bytes, node_to_bytes},
    Allocator, NodePtr,
};

use super::Insertion;

pub fn process_coin_spend(height: u32, coin_spend: CoinSpend) -> Vec<Insertion> {
    let mut insertions = Vec::new();

    let coin_id = coin_spend.coin.coin_id();

    let mut allocator = Allocator::new();
    let puzzle = node_from_bytes(&mut allocator, &coin_spend.puzzle_reveal).unwrap();
    let solution = node_from_bytes(&mut allocator, &coin_spend.solution).unwrap();

    let output = run_puzzle(&mut allocator, puzzle, solution).unwrap();
    let conditions = Vec::<Condition>::from_clvm(&allocator, output).unwrap();

    for condition in &conditions {
        if let Condition::CreateCoin(cond) = condition {
            let hint = if let Some(memos) = cond.memos {
                <(Bytes32, NodePtr)>::from_clvm(&allocator, memos.value)
                    .ok()
                    .map(|(hint, _)| hint)
            } else {
                None
            };

            let memos = cond
                .memos
                .map(|memos| Program::from_clvm(&allocator, memos.value))
                .transpose()
                .ok()
                .flatten()
                .map(Program::into_bytes);

            insertions.push(Insertion::Coin {
                coin: Coin::new(coin_id, cond.puzzle_hash, cond.amount),
                hint,
                memos,
                created_height: height,
                reward: false,
            });
        }
    }

    let puzzle = Puzzle::parse(&allocator, puzzle);

    if puzzle.curried_puzzle_hash() == SINGLETON_LAUNCHER_HASH.into() {
        let output = run_puzzle(&mut allocator, puzzle.ptr(), solution).unwrap();
        let conditions = Vec::<Condition>::from_clvm(&allocator, output).unwrap();

        let solution = LauncherSolution::<NodePtr>::from_clvm(&allocator, solution).unwrap();
        let inner_puzzle_hash = solution.singleton_puzzle_hash;

        for condition in conditions {
            if let Condition::CreateCoin(cond) = condition {
                let eve_coin_id = Coin::new(coin_id, cond.puzzle_hash, cond.amount).coin_id();

                insertions.push(Insertion::SingletonCoin {
                    coin_id: eve_coin_id,
                    launcher_id: coin_id,
                    inner_puzzle_hash,
                });
            }
        }
    } else if puzzle.mod_hash() == SINGLETON_TOP_LAYER_V1_1_HASH.into() && puzzle.is_curried() {
        let puzzle = puzzle.as_curried().unwrap();
        let args = SingletonArgs::<NodePtr>::from_clvm(&allocator, puzzle.args).unwrap();
        let solution = SingletonSolution::<NodePtr>::from_clvm(&allocator, solution).unwrap();

        let output =
            run_puzzle(&mut allocator, args.inner_puzzle, solution.inner_solution).unwrap();
        let conditions = Vec::<Condition>::from_clvm(&allocator, output).unwrap();

        for condition in conditions {
            if let Condition::CreateCoin(cond) = condition {
                if cond.amount % 2 != 1 {
                    continue;
                }

                let child_coin_id = Coin::new(
                    coin_id,
                    SingletonArgs::curry_tree_hash(
                        args.singleton_struct.launcher_id,
                        cond.puzzle_hash.into(),
                    )
                    .into(),
                    cond.amount,
                )
                .coin_id();

                insertions.push(Insertion::SingletonCoin {
                    coin_id: child_coin_id,
                    launcher_id: args.singleton_struct.launcher_id,
                    inner_puzzle_hash: cond.puzzle_hash,
                });
            }
        }
    } else if puzzle.mod_hash() == CAT_PUZZLE_HASH.into() && puzzle.is_curried() {
        let puzzle = puzzle.as_curried().unwrap();
        let args = CatArgs::<NodePtr>::from_clvm(&allocator, puzzle.args).unwrap();
        let solution = CatSolution::<NodePtr>::from_clvm(&allocator, solution).unwrap();

        let output = run_puzzle(
            &mut allocator,
            args.inner_puzzle,
            solution.inner_puzzle_solution,
        )
        .unwrap();
        let conditions = Vec::<Condition>::from_clvm(&allocator, output).unwrap();

        for condition in conditions {
            match condition {
                Condition::CreateCoin(cond) => {
                    let child_coin_id = Coin::new(
                        coin_id,
                        CatArgs::curry_tree_hash(args.asset_id, cond.puzzle_hash.into()).into(),
                        cond.amount,
                    )
                    .coin_id();

                    insertions.push(Insertion::CatCoin {
                        coin_id: child_coin_id,
                        asset_id: args.asset_id,
                        inner_puzzle_hash: cond.puzzle_hash,
                    });
                }
                Condition::RunCatTail(cond) => {
                    let tail = node_to_bytes(&allocator, cond.program).unwrap();

                    insertions.push(Insertion::CatTail {
                        asset_id: args.asset_id,
                        tail,
                    });
                }
                _ => {}
            }
        }
    }

    insertions.push(Insertion::CoinSpend {
        coin_id,
        puzzle_reveal: coin_spend.puzzle_reveal.into(),
        solution: coin_spend.solution.into(),
        spent_height: height,
    });

    insertions
}
