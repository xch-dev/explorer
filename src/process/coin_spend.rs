use chia::{
    clvm_traits::FromClvm,
    protocol::{Bytes32, Coin, Program},
    puzzles::{
        cat::{CatArgs, CatSolution},
        singleton::{LauncherSolution, SingletonArgs, SingletonSolution},
        standard::{StandardArgs, StandardSolution},
    },
};
use chia_puzzles::{
    CAT_PUZZLE_HASH, P2_DELEGATED_PUZZLE_OR_HIDDEN_PUZZLE_HASH, SINGLETON_LAUNCHER_HASH,
    SINGLETON_TOP_LAYER_V1_1_HASH,
};
use chia_wallet_sdk::{
    driver::Puzzle,
    types::{run_puzzle, Condition},
};
use clvmr::{serde::node_to_bytes, Allocator, NodePtr};

use super::Insertion;

struct SpendState<'a> {
    allocator: &'a mut Allocator,
    coin_id: Bytes32,
    height: u32,
    insertions: &'a mut Vec<Insertion>,
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
                let conditions = self.inner(puzzle, solution);
                self.process_conditions(&conditions);
            }
        }
    }

    fn inner(&mut self, puzzle: Puzzle, solution: NodePtr) -> Vec<Condition> {
        match puzzle.mod_hash().to_bytes() {
            P2_DELEGATED_PUZZLE_OR_HIDDEN_PUZZLE_HASH => self.standard(puzzle, solution),
            _ => self.conditions(puzzle.ptr(), solution),
        }
    }

    #[must_use]
    fn standard(&mut self, puzzle: Puzzle, solution: NodePtr) -> Vec<Condition> {
        let Some(puzzle) = puzzle.as_curried() else {
            return self.conditions(puzzle.ptr(), solution);
        };

        let args = StandardArgs::from_clvm(self.allocator, puzzle.args).unwrap();
        let parsed_solution =
            StandardSolution::<Puzzle, NodePtr>::from_clvm(self.allocator, solution).unwrap();

        let mut conditions = self.inner(parsed_solution.delegated_puzzle, parsed_solution.solution);

        conditions.insert(
            0,
            Condition::agg_sig_me(
                args.synthetic_key,
                parsed_solution
                    .delegated_puzzle
                    .curried_puzzle_hash()
                    .to_vec()
                    .into(),
            ),
        );

        conditions
    }

    fn launcher(&mut self, puzzle: Puzzle, solution: NodePtr) {
        let parsed_solution =
            LauncherSolution::<NodePtr>::from_clvm(self.allocator, solution).unwrap();
        let inner_puzzle_hash = parsed_solution.singleton_puzzle_hash;

        let conditions = self.top_level(puzzle, solution);

        for condition in conditions {
            if let Condition::CreateCoin(cond) = condition {
                let eve_coin_id = Coin::new(self.coin_id, cond.puzzle_hash, cond.amount).coin_id();

                self.insertions.push(Insertion::SingletonCoin {
                    coin_id: eve_coin_id,
                    launcher_id: self.coin_id,
                    inner_puzzle_hash,
                });
            }
        }
    }

    fn singleton(&mut self, puzzle: Puzzle, solution: NodePtr) {
        let Some(puzzle) = puzzle.as_curried() else {
            self.top_level(puzzle, solution);
            return;
        };

        let args = SingletonArgs::<Puzzle>::from_clvm(self.allocator, puzzle.args).unwrap();
        let parsed_solution =
            SingletonSolution::<NodePtr>::from_clvm(self.allocator, solution).unwrap();

        let conditions = self.inner(args.inner_puzzle, parsed_solution.inner_solution);

        for condition in conditions {
            if let Condition::CreateCoin(mut cond) = condition {
                if cond.amount % 2 != 1 {
                    continue;
                }

                cond.puzzle_hash = SingletonArgs::curry_tree_hash(
                    args.singleton_struct.launcher_id,
                    cond.puzzle_hash.into(),
                )
                .into();

                let coin_id = Coin::new(self.coin_id, cond.puzzle_hash, cond.amount).coin_id();

                self.insertions.push(Insertion::SingletonCoin {
                    coin_id,
                    launcher_id: args.singleton_struct.launcher_id,
                    inner_puzzle_hash: cond.puzzle_hash,
                });
            }
        }

        let conditions = self.conditions(puzzle.curried_ptr, solution);
        self.process_conditions(&conditions);
    }

    fn cat(&mut self, puzzle: Puzzle, solution: NodePtr) {
        let Some(puzzle) = puzzle.as_curried() else {
            self.top_level(puzzle, solution);
            return;
        };

        let args = CatArgs::<Puzzle>::from_clvm(self.allocator, puzzle.args).unwrap();
        let parsed_solution = CatSolution::<NodePtr>::from_clvm(self.allocator, solution).unwrap();

        let conditions = self.inner(args.inner_puzzle, parsed_solution.inner_puzzle_solution);

        for condition in conditions {
            match condition {
                Condition::CreateCoin(mut cond) => {
                    cond.puzzle_hash =
                        CatArgs::curry_tree_hash(args.asset_id, cond.puzzle_hash.into()).into();

                    let child_coin_id =
                        Coin::new(self.coin_id, cond.puzzle_hash, cond.amount).coin_id();

                    self.insertions.push(Insertion::CatCoin {
                        coin_id: child_coin_id,
                        asset_id: args.asset_id,
                        inner_puzzle_hash: cond.puzzle_hash,
                    });
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

        let conditions = self.conditions(puzzle.curried_ptr, solution);
        self.process_conditions(&conditions);
    }

    fn process_conditions(&mut self, conditions: &[Condition]) {
        for condition in conditions {
            if let Condition::CreateCoin(cond) = condition {
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
                    .map(Program::into_bytes);

                self.insertions.push(Insertion::Coin {
                    coin: Coin::new(self.coin_id, cond.puzzle_hash, cond.amount),
                    hint,
                    memos,
                    created_height: self.height,
                    reward: false,
                });
            }
        }
    }

    fn top_level(&mut self, puzzle: Puzzle, solution: NodePtr) -> Vec<Condition> {
        let conditions = self.conditions(puzzle.ptr(), solution);
        self.process_conditions(&conditions);
        conditions
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
    coin_id: Bytes32,
    puzzle: NodePtr,
    solution: NodePtr,
) {
    let puzzle = Puzzle::parse(allocator, puzzle);

    let mut spend_state = SpendState {
        allocator,
        coin_id,
        height,
        insertions,
    };

    spend_state.parse(puzzle, solution);

    let puzzle_reveal = node_to_bytes(allocator, puzzle.ptr()).unwrap();
    let solution = node_to_bytes(allocator, solution).unwrap();

    insertions.push(Insertion::CoinSpend {
        coin_id,
        puzzle_reveal,
        solution,
        spent_height: height,
    });
}
