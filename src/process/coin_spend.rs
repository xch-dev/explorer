use chia::{
    clvm_traits::FromClvm,
    protocol::{Bytes32, Coin},
    puzzles::{Memos, Proof},
};
use chia_wallet_sdk::{
    driver::{Cat, ClawbackV2, Did, HashedPtr, Nft, Puzzle},
    types::{run_puzzle, Condition},
};
use clvmr::{serde::node_to_bytes, Allocator, NodePtr};
use indexmap::IndexMap;

use crate::{
    db::{CatLineageProof, CoinKind, CoinRow, P2Puzzle, SingletonLineageProof},
    process::CoinSpendInsertion,
};

use super::Insertions;

pub fn process_coin_spend(
    insertions: &mut Insertions,
    allocator: &mut Allocator,
    height: u32,
    coin: Coin,
    puzzle: NodePtr,
    solution: NodePtr,
) -> u32 {
    let puzzle = Puzzle::parse(allocator, puzzle);
    let coin_id = coin.coin_id();

    let output = run_puzzle(allocator, puzzle.ptr(), solution).unwrap();
    let conditions = Vec::<Condition>::from_clvm(allocator, output).unwrap();

    let mut children = IndexMap::new();

    for condition in &conditions {
        if let Some(create_coin) = condition.as_create_coin() {
            let child_coin = Coin::new(coin.coin_id(), create_coin.puzzle_hash, create_coin.amount);

            let mut hint = None;
            let mut memos = None;
            let mut clawback_memo = None;

            if let Memos::Some(memos_ptr) = create_coin.memos {
                if let Ok((parsed_hint, rest)) =
                    <(Bytes32, NodePtr)>::from_clvm(allocator, memos_ptr)
                {
                    hint = Some(parsed_hint);

                    if let Ok((memo, _)) = <(NodePtr, NodePtr)>::from_clvm(allocator, rest) {
                        clawback_memo = Some(memo);
                    }
                }

                memos = node_to_bytes(allocator, memos_ptr).ok().map(Into::into);
            }

            children.insert(
                child_coin.coin_id(),
                (
                    CoinRow {
                        coin: child_coin,
                        created_height: height,
                        spend: None,
                        hint,
                        memos,
                        kind: None,
                        p2_puzzle: None,
                    },
                    clawback_memo,
                ),
            );
        }
    }

    let mut kind = None;

    if let Ok(Some((cat, ..))) = Cat::parse(allocator, coin, puzzle, solution) {
        kind = Some(CoinKind::Cat {
            asset_id: cat.info.asset_id,
            hidden_puzzle_hash: cat.info.hidden_puzzle_hash,
            p2_puzzle_hash: cat.info.p2_puzzle_hash,
            lineage_proof: cat.lineage_proof.map(|lp| CatLineageProof {
                parent_parent_coin_info: lp.parent_parent_coin_info,
                parent_inner_puzzle_hash: lp.parent_inner_puzzle_hash,
                parent_amount: lp.parent_amount,
            }),
        });

        for child in Cat::parse_children(allocator, coin, puzzle, solution)
            .ok()
            .flatten()
            .into_iter()
            .flatten()
        {
            let (row, clawback_memo) = children.get_mut(&child.coin.coin_id()).unwrap();

            if let (Some(receiver_puzzle_hash), Some(memo)) = (row.hint, *clawback_memo) {
                if let Some(clawback) = ClawbackV2::from_memo(
                    allocator,
                    memo,
                    receiver_puzzle_hash,
                    child.coin.amount,
                    true,
                    child.info.p2_puzzle_hash,
                ) {
                    row.p2_puzzle = Some(P2Puzzle::ClawbackV2 {
                        sender_puzzle_hash: clawback.sender_puzzle_hash,
                        receiver_puzzle_hash: clawback.receiver_puzzle_hash,
                        seconds: clawback.seconds,
                        amount: clawback.amount,
                        hinted: clawback.hinted,
                    });
                }
            }

            row.kind = Some(CoinKind::Cat {
                asset_id: child.info.asset_id,
                hidden_puzzle_hash: child.info.hidden_puzzle_hash,
                p2_puzzle_hash: child.info.p2_puzzle_hash,
                lineage_proof: child.lineage_proof.map(|lp| CatLineageProof {
                    parent_parent_coin_info: lp.parent_parent_coin_info,
                    parent_inner_puzzle_hash: lp.parent_inner_puzzle_hash,
                    parent_amount: lp.parent_amount,
                }),
            });
        }
    }

    if let Ok(Some((nft, ..))) = Nft::<HashedPtr>::parse(allocator, coin, puzzle, solution) {
        kind = Some(CoinKind::Nft {
            launcher_id: nft.info.launcher_id,
            metadata: node_to_bytes(allocator, nft.info.metadata.ptr())
                .unwrap()
                .into(),
            metadata_updater_puzzle_hash: nft.info.metadata_updater_puzzle_hash,
            current_owner: nft.info.current_owner,
            royalty_puzzle_hash: nft.info.royalty_puzzle_hash,
            royalty_basis_points: nft.info.royalty_basis_points,
            p2_puzzle_hash: nft.info.p2_puzzle_hash,
            lineage_proof: match nft.proof {
                Proof::Eve(p) => SingletonLineageProof {
                    parent_parent_coin_info: p.parent_parent_coin_info,
                    parent_inner_puzzle_hash: None,
                    parent_amount: p.parent_amount,
                },
                Proof::Lineage(lp) => SingletonLineageProof {
                    parent_parent_coin_info: lp.parent_parent_coin_info,
                    parent_inner_puzzle_hash: Some(lp.parent_inner_puzzle_hash),
                    parent_amount: lp.parent_amount,
                },
            },
        });

        if let Ok(Some(child)) = Nft::<HashedPtr>::parse_child(allocator, coin, puzzle, solution) {
            let (row, clawback_memo) = children.get_mut(&child.coin.coin_id()).unwrap();

            if let (Some(receiver_puzzle_hash), Some(memo)) = (row.hint, *clawback_memo) {
                if let Some(clawback) = ClawbackV2::from_memo(
                    allocator,
                    memo,
                    receiver_puzzle_hash,
                    child.coin.amount,
                    true,
                    child.info.p2_puzzle_hash,
                ) {
                    row.p2_puzzle = Some(P2Puzzle::ClawbackV2 {
                        sender_puzzle_hash: clawback.sender_puzzle_hash,
                        receiver_puzzle_hash: clawback.receiver_puzzle_hash,
                        seconds: clawback.seconds,
                        amount: clawback.amount,
                        hinted: clawback.hinted,
                    });
                }
            }

            row.kind = Some(CoinKind::Nft {
                launcher_id: child.info.launcher_id,
                metadata: node_to_bytes(allocator, child.info.metadata.ptr())
                    .unwrap()
                    .into(),
                metadata_updater_puzzle_hash: child.info.metadata_updater_puzzle_hash,
                current_owner: child.info.current_owner,
                royalty_puzzle_hash: child.info.royalty_puzzle_hash,
                royalty_basis_points: child.info.royalty_basis_points,
                p2_puzzle_hash: child.info.p2_puzzle_hash,
                lineage_proof: match child.proof {
                    Proof::Eve(p) => SingletonLineageProof {
                        parent_parent_coin_info: p.parent_parent_coin_info,
                        parent_inner_puzzle_hash: None,
                        parent_amount: p.parent_amount,
                    },
                    Proof::Lineage(lp) => SingletonLineageProof {
                        parent_parent_coin_info: lp.parent_parent_coin_info,
                        parent_inner_puzzle_hash: Some(lp.parent_inner_puzzle_hash),
                        parent_amount: lp.parent_amount,
                    },
                },
            });
        }
    }

    if let Ok(Some((did, ..))) = Did::<HashedPtr>::parse(allocator, coin, puzzle, solution) {
        kind = Some(CoinKind::Did {
            launcher_id: did.info.launcher_id,
            metadata: node_to_bytes(allocator, did.info.metadata.ptr())
                .unwrap()
                .into(),
            recovery_list_hash: did.info.recovery_list_hash,
            num_verifications_required: did.info.num_verifications_required,
            p2_puzzle_hash: did.info.p2_puzzle_hash,
            lineage_proof: match did.proof {
                Proof::Eve(p) => SingletonLineageProof {
                    parent_parent_coin_info: p.parent_parent_coin_info,
                    parent_inner_puzzle_hash: None,
                    parent_amount: p.parent_amount,
                },
                Proof::Lineage(lp) => SingletonLineageProof {
                    parent_parent_coin_info: lp.parent_parent_coin_info,
                    parent_inner_puzzle_hash: Some(lp.parent_inner_puzzle_hash),
                    parent_amount: lp.parent_amount,
                },
            },
        });

        for (row, clawback_memo) in children.values_mut() {
            if row.coin.amount % 2 != 1 {
                continue;
            }

            let Ok(Some(child)) =
                Did::<HashedPtr>::parse_child(allocator, coin, puzzle, solution, row.coin)
            else {
                break;
            };

            if let (Some(receiver_puzzle_hash), Some(memo)) = (row.hint, *clawback_memo) {
                if let Some(clawback) = ClawbackV2::from_memo(
                    allocator,
                    memo,
                    receiver_puzzle_hash,
                    child.coin.amount,
                    true,
                    child.info.p2_puzzle_hash,
                ) {
                    row.p2_puzzle = Some(P2Puzzle::ClawbackV2 {
                        sender_puzzle_hash: clawback.sender_puzzle_hash,
                        receiver_puzzle_hash: clawback.receiver_puzzle_hash,
                        seconds: clawback.seconds,
                        amount: clawback.amount,
                        hinted: clawback.hinted,
                    });
                }
            }

            row.kind = Some(CoinKind::Did {
                launcher_id: child.info.launcher_id,
                metadata: node_to_bytes(allocator, child.info.metadata.ptr())
                    .unwrap()
                    .into(),
                recovery_list_hash: child.info.recovery_list_hash,
                num_verifications_required: child.info.num_verifications_required,
                p2_puzzle_hash: child.info.p2_puzzle_hash,
                lineage_proof: match child.proof {
                    Proof::Eve(p) => SingletonLineageProof {
                        parent_parent_coin_info: p.parent_parent_coin_info,
                        parent_inner_puzzle_hash: None,
                        parent_amount: p.parent_amount,
                    },
                    Proof::Lineage(lp) => SingletonLineageProof {
                        parent_parent_coin_info: lp.parent_parent_coin_info,
                        parent_inner_puzzle_hash: Some(lp.parent_inner_puzzle_hash),
                        parent_amount: lp.parent_amount,
                    },
                },
            });
        }
    }

    let additions = children.len();

    for (coin_id, (row, _)) in children {
        insertions.coins.insert(coin_id, row);
    }

    insertions.coin_spends.insert(
        coin_id,
        CoinSpendInsertion {
            spent_height: height,
            puzzle_reveal: node_to_bytes(allocator, puzzle.ptr()).unwrap().into(),
            solution: node_to_bytes(allocator, solution).unwrap().into(),
            kind,
            p2_puzzle: None,
        },
    );

    additions as u32
}
