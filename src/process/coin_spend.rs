use chia::{
    clvm_traits::FromClvm,
    protocol::{Bytes32, Coin, Program},
    puzzles::{
        cat::{CatArgs, CatSolution},
        singleton::{SingletonArgs, SingletonSolution},
    },
};
use chia_puzzles::{CAT_PUZZLE_HASH, SINGLETON_LAUNCHER_HASH, SINGLETON_TOP_LAYER_V1_1_HASH};
use chia_wallet_sdk::{
    driver::Puzzle,
    prelude::CreateCoin,
    types::{run_puzzle, Condition},
};
use clvmr::{serde::node_to_bytes, Allocator, NodePtr};
use itertools::Itertools;

use crate::db::{CoinRow, CoinType, LineageProof};

use super::Insertion;

struct SpendState<'a> {
    allocator: &'a mut Allocator,
    coin_id: Bytes32,
    coin: Coin,
    height: u32,
    insertions: &'a mut Vec<Insertion>,
    additions: u32,
}

impl SpendState<'_> {
    fn parse(&mut self, puzzle: Puzzle, solution: NodePtr) {
        match puzzle.mod_hash().to_bytes() {
            SINGLETON_LAUNCHER_HASH => {
                self.launcher(puzzle, solution);
            }
            SINGLETON_TOP_LAYER_V1_1_HASH => {
                self.singleton(puzzle, solution);
            }
            CAT_PUZZLE_HASH => {
                self.cat(puzzle, solution);
            }
            _ => {
                let conditions = self.conditions(puzzle.ptr(), solution);
                let rows = self.coin_rows(&conditions);
                self.insert_coin_rows(rows);
            }
        }
    }

    fn launcher(&mut self, puzzle: Puzzle, solution: NodePtr) {
        let conditions = self.conditions(puzzle.ptr(), solution);
        let mut rows = self.coin_rows(&conditions);

        let launcher_id = self.coin_id;
        let launcher = self.coin;

        for row in &mut rows {
            row.kind = CoinType::Singleton {
                launcher_id,
                lineage_proof: LineageProof {
                    parent_parent_coin_id: launcher.parent_coin_info,
                    parent_inner_puzzle_hash: None,
                    parent_amount: launcher.amount,
                },
            };
        }

        self.insert_coin_rows(rows);
    }

    fn singleton(&mut self, puzzle: Puzzle, solution: NodePtr) {
        let puzzle = puzzle.as_curried().unwrap();

        let singleton_args =
            SingletonArgs::<Puzzle>::from_clvm(self.allocator, puzzle.args).unwrap();
        let singleton_solution =
            SingletonSolution::<NodePtr>::from_clvm(self.allocator, solution).unwrap();

        let lineage_proof = LineageProof {
            parent_parent_coin_id: self.coin.parent_coin_info,
            parent_inner_puzzle_hash: Some(
                singleton_args.inner_puzzle.curried_puzzle_hash().into(),
            ),
            parent_amount: self.coin.amount,
        };

        let conditions = self.conditions(
            singleton_args.inner_puzzle.ptr(),
            singleton_solution.inner_solution,
        );

        let mut rows = self.coin_rows(&conditions);

        for row in &mut rows {
            if row.amount % 2 != 1 {
                continue;
            }

            row.kind = CoinType::Singleton {
                launcher_id: singleton_args.singleton_struct.launcher_id,
                lineage_proof,
            };
        }

        self.insert_coin_rows(rows);
    }

    fn cat(&mut self, puzzle: Puzzle, solution: NodePtr) {
        let puzzle = puzzle.as_curried().unwrap();

        let args = CatArgs::<Puzzle>::from_clvm(self.allocator, puzzle.args).unwrap();
        let parsed_solution = CatSolution::<NodePtr>::from_clvm(self.allocator, solution).unwrap();

        let conditions = self.conditions(
            args.inner_puzzle.ptr(),
            parsed_solution.inner_puzzle_solution,
        );

        let mut create_coins = Vec::new();
        let mut inner_puzzle_hashes = Vec::new();

        for condition in conditions {
            match condition {
                Condition::CreateCoin(cond) => {
                    let coin = CreateCoin::<NodePtr>::new(
                        CatArgs::curry_tree_hash(args.asset_id, cond.puzzle_hash.into()).into(),
                        cond.amount,
                        cond.memos,
                    );

                    create_coins.push(coin);
                    inner_puzzle_hashes.push(cond.puzzle_hash);
                }
                Condition::RunCatTail(cond) => {
                    let tail = node_to_bytes(self.allocator, cond.program).unwrap();

                    self.insertions.push(Insertion::CatTail {
                        asset_id: args.asset_id,
                        tail,
                    });
                }
                _ => {}
            }
        }

        let parent_parent_coin_id = self.coin.parent_coin_info;
        let parent_amount = self.coin.amount;

        let mut rows = self.coin_rows(&create_coins.into_iter().map(Condition::from).collect_vec());

        for (i, row) in rows.iter_mut().enumerate() {
            row.kind = CoinType::Cat {
                asset_id: args.asset_id,
                inner_puzzle_hash: inner_puzzle_hashes[i],
                lineage_proof: LineageProof {
                    parent_parent_coin_id,
                    parent_inner_puzzle_hash: Some(args.inner_puzzle.curried_puzzle_hash().into()),
                    parent_amount,
                },
            };
        }

        self.insert_coin_rows(rows);
    }

    fn coin_rows(&mut self, conditions: &[Condition]) -> Vec<CoinRow> {
        let mut coins = Vec::new();

        for cond in conditions.iter().filter_map(Condition::as_create_coin) {
            let hint = if let Some(memos) = cond.memos {
                <(Bytes32, NodePtr)>::from_clvm(self.allocator, memos.value)
                    .ok()
                    .map(|(hint, _)| hint)
            } else {
                None
            };

            let memos = cond
                .memos
                .map(|memos| Program::from_clvm(self.allocator, memos.value))
                .transpose()
                .ok()
                .flatten()
                .map(Program::into_inner);

            coins.push(CoinRow {
                coin_id: Coin::new(self.coin_id, cond.puzzle_hash, cond.amount).coin_id(),
                parent_coin_id: self.coin_id,
                puzzle_hash: cond.puzzle_hash,
                amount: cond.amount,
                created_height: self.height,
                hint,
                memos,
                reward: false,
                kind: CoinType::Unknown,
            });
        }

        coins
    }

    fn insert_coin_rows(&mut self, coins: Vec<CoinRow>) {
        for coin in coins {
            self.insertions.push(Insertion::Coin {
                coin: Box::new(coin),
            });
            self.additions += 1;
        }
    }

    fn conditions(&mut self, puzzle: NodePtr, solution: NodePtr) -> Vec<Condition> {
        let output = run_puzzle(self.allocator, puzzle, solution).unwrap();
        Vec::<Condition>::from_clvm(self.allocator, output).unwrap()
    }
}

pub fn process_coin_spend(
    insertions: &mut Vec<Insertion>,
    allocator: &mut Allocator,
    height: u32,
    coin: Coin,
    puzzle: NodePtr,
    solution: NodePtr,
) -> u32 {
    let puzzle = Puzzle::parse(allocator, puzzle);
    let coin_id = coin.coin_id();

    let mut spend_state = SpendState {
        allocator,
        coin_id,
        coin,
        height,
        insertions,
        additions: 0,
    };

    spend_state.parse(puzzle, solution);

    let additions = spend_state.additions;

    let puzzle_reveal = node_to_bytes(allocator, puzzle.ptr()).unwrap();
    let solution = node_to_bytes(allocator, solution).unwrap();

    insertions.push(Insertion::CoinSpend {
        coin_id,
        puzzle_reveal,
        solution,
        spent_height: height,
    });

    additions
}
