import { Coin, Program, toHex } from 'chia-wallet-sdk-wasm';

import { ArgType } from './arg';
import { ConditionArg } from './conditions';

export enum MessageSide {
  Sender,
  Receiver,
}

export interface MessageFlags {
  parent: boolean;
  puzzle: boolean;
  amount: boolean;
}

export function parseMessageFlags(
  mode: number,
  side: MessageSide,
): MessageFlags {
  // Get the relevant 3 bits based on direction
  const relevant_bits =
    side === MessageSide.Sender ? (mode & 0b11_1000) >> 3 : mode & 0b00_0111;

  const flags: MessageFlags = {
    parent: false,
    puzzle: false,
    amount: false,
  };

  if ((relevant_bits & 0b100) !== 0) {
    flags.parent = true;
  }

  if ((relevant_bits & 0b010) !== 0) {
    flags.puzzle = true;
  }

  if ((relevant_bits & 0b001) !== 0) {
    flags.amount = true;
  }

  return flags;
}

export function insertMessageModeData(
  args: Record<string, ConditionArg>,
  flags: MessageFlags,
  data: Coin | Program[],
  prefix: string,
) {
  if (Array.isArray(data)) {
    if (flags.parent && flags.puzzle && flags.amount) {
      const coinId = data[0]?.toAtom();
      args[`${prefix}_coin_id`] = coinId
        ? {
            value: `0x${toHex(coinId)}`,
            type: ArgType.CoinId,
          }
        : {
            value: 'Missing',
            type: ArgType.NonCopiable,
          };
    } else {
      if (flags.parent && flags.puzzle) {
        const parentCoinId = data[0]?.toAtom();
        const puzzleHash = data[1]?.toAtom();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? {
              value: `0x${toHex(parentCoinId)}`,
              type: ArgType.CoinId,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? {
              value: `0x${toHex(puzzleHash)}`,
              type: ArgType.Copiable,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
      } else if (flags.parent && flags.amount) {
        const parentCoinId = data[0]?.toAtom();
        const amount = data[1]?.toInt();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? {
              value: `0x${toHex(parentCoinId)}`,
              type: ArgType.CoinId,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
        args[`${prefix}_amount`] = amount
          ? {
              value: amount.toString(),
              type: ArgType.NonCopiable,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
      } else if (flags.puzzle && flags.amount) {
        const puzzleHash = data[0]?.toAtom();
        const amount = data[1]?.toInt();
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? {
              value: `0x${toHex(puzzleHash)}`,
              type: ArgType.Copiable,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
        args[`${prefix}_amount`] = amount
          ? {
              value: amount.toString(),
              type: ArgType.NonCopiable,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
      } else if (flags.parent) {
        const parentCoinId = data[0]?.toAtom();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? {
              value: `0x${toHex(parentCoinId)}`,
              type: ArgType.CoinId,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
      } else if (flags.puzzle) {
        const puzzleHash = data[0]?.toAtom();
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? {
              value: `0x${toHex(puzzleHash)}`,
              type: ArgType.Copiable,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
      } else if (flags.amount) {
        const amount = data[0]?.toInt();
        args[`${prefix}_amount`] = amount
          ? {
              value: amount.toString(),
              type: ArgType.NonCopiable,
            }
          : {
              value: 'Missing',
              type: ArgType.NonCopiable,
            };
      }
    }

    return;
  }

  if (flags.parent && flags.puzzle && flags.amount) {
    args[`${prefix}_coin_id`] = {
      value: `0x${toHex(data.coinId())}`,
      type: ArgType.CoinId,
    };
  } else {
    if (flags.parent) {
      args[`${prefix}_parent_coin_id`] = {
        value: `0x${toHex(data.parentCoinInfo)}`,
        type: ArgType.CoinId,
      };
    }
    if (flags.puzzle) {
      args[`${prefix}_puzzle_hash`] = {
        value: `0x${toHex(data.puzzleHash)}`,
        type: ArgType.Copiable,
      };
    }
    if (flags.amount) {
      args[`${prefix}_amount`] = {
        value: data.amount.toString(),
        type: ArgType.NonCopiable,
      };
    }
  }
}
