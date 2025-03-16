use chia::{
    clvm_traits::{clvm_list, FromClvm, ToClvm},
    clvm_utils::{tree_hash_atom, ToTreeHash},
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
    types::{announcement_id, run_puzzle, Condition},
};
use clvmr::{serde::node_to_bytes, Allocator, NodePtr};

use super::Insertion;

struct SpendState<'a> {
    allocator: &'a mut Allocator,
    coin: Coin,
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

        let mut conditions = self.inner(args.inner_puzzle, parsed_solution.inner_solution);

        conditions.retain_mut(|condition| match condition {
            Condition::CreateCoin(cond) => {
                if cond.amount % 2 != 1 {
                    return true;
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

                true
            }
            Condition::MeltSingleton(_) => false,
            _ => true,
        });

        conditions.insert(
            0,
            Condition::assert_my_parent_id(self.coin.parent_coin_info),
        );
        conditions.insert(0, Condition::assert_my_amount(self.coin.amount));

        self.process_conditions(&conditions);
    }

    fn cat(&mut self, puzzle: Puzzle, solution: NodePtr) {
        let Some(puzzle) = puzzle.as_curried() else {
            self.top_level(puzzle, solution);
            return;
        };

        let args = CatArgs::<Puzzle>::from_clvm(self.allocator, puzzle.args).unwrap();
        let parsed_solution = CatSolution::<NodePtr>::from_clvm(self.allocator, solution).unwrap();

        let inner_conditions = self.inner(args.inner_puzzle, parsed_solution.inner_puzzle_solution);

        let truths = (
            (
                Bytes32::from(args.inner_puzzle.curried_puzzle_hash()),
                clvm_list!(
                    Bytes32::from(CAT_PUZZLE_HASH),
                    Bytes32::from(tree_hash_atom(&CAT_PUZZLE_HASH)),
                    args.asset_id,
                ),
            ),
            (self.coin_id, parsed_solution.this_coin_info),
        );

        let parent_is_cat = if let Some(lineage_proof) = &parsed_solution.lineage_proof {
            Coin::new(
                lineage_proof.parent_parent_coin_info,
                CatArgs::curry_tree_hash(
                    args.asset_id,
                    lineage_proof.parent_inner_puzzle_hash.into(),
                )
                .into(),
                lineage_proof.parent_amount,
            )
            .coin_id()
                == self.coin.parent_coin_info
        } else {
            false
        };

        let mut tail_conditions = Vec::new();

        let subtotal = (parsed_solution.prev_subtotal as i128
            + parsed_solution.extra_delta as i128
            + self.coin.amount as i128
            - inner_conditions
                .iter()
                .filter_map(Condition::as_create_coin)
                .map(|cc| cc.amount as i128)
                .sum::<i128>()) as i64;

        let mut create_message = vec![0xcb];
        create_message.extend_from_slice(
            &clvm_list!(parsed_solution.prev_coin_id, parsed_solution.prev_subtotal).tree_hash(),
        );

        let mut assert_message = vec![0xcb];
        assert_message.extend_from_slice(&clvm_list!(self.coin_id, subtotal).tree_hash());

        let announcements = vec![
            Condition::<NodePtr>::create_coin_announcement(create_message.into()),
            Condition::<NodePtr>::assert_coin_announcement(announcement_id(
                Coin::new(
                    parsed_solution.next_coin_proof.parent_coin_info,
                    CatArgs::curry_tree_hash(
                        args.asset_id,
                        parsed_solution.next_coin_proof.inner_puzzle_hash.into(),
                    )
                    .into(),
                    parsed_solution.next_coin_proof.amount,
                )
                .coin_id(),
                assert_message,
            )),
        ];

        let mut conditions = [announcements, inner_conditions.clone()].concat();

        conditions.retain_mut(|condition| match condition {
            Condition::CreateCoin(cond) => {
                cond.puzzle_hash =
                    CatArgs::curry_tree_hash(args.asset_id, cond.puzzle_hash.into()).into();

                let child_coin_id =
                    Coin::new(self.coin_id, cond.puzzle_hash, cond.amount).coin_id();

                self.insertions.push(Insertion::CatCoin {
                    coin_id: child_coin_id,
                    asset_id: args.asset_id,
                    inner_puzzle_hash: cond.puzzle_hash,
                });

                true
            }
            Condition::RunCatTail(cond) => {
                let tail_puzzle = Puzzle::parse(self.allocator, cond.program);
                let tail_solution = clvm_list!(
                    truths,
                    parent_is_cat,
                    parsed_solution.lineage_proof,
                    parsed_solution.extra_delta,
                    &inner_conditions,
                    cond.solution
                )
                .to_clvm(self.allocator)
                .unwrap();
                tail_conditions = self.inner(tail_puzzle, tail_solution);

                let tail = node_to_bytes(self.allocator, cond.program).unwrap();

                self.insertions.push(Insertion::CatTail {
                    asset_id: args.asset_id,
                    tail,
                });

                false
            }
            _ => true,
        });

        conditions = [tail_conditions, conditions].concat();

        conditions.insert(0, Condition::assert_my_coin_id(self.coin_id));

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
    coin: Coin,
    puzzle: NodePtr,
    solution: NodePtr,
) {
    let puzzle = Puzzle::parse(allocator, puzzle);

    let mut spend_state = SpendState {
        allocator,
        coin,
        coin_id: coin.coin_id(),
        height,
        insertions,
    };

    spend_state.parse(puzzle, solution);

    let puzzle_reveal = node_to_bytes(allocator, puzzle.ptr()).unwrap();
    let solution = node_to_bytes(allocator, solution).unwrap();

    insertions.push(Insertion::CoinSpend {
        coin_id: coin.coin_id(),
        puzzle_reveal,
        solution,
        spent_height: height,
    });
}
