import {
  Clvm,
  Coin,
  CoinSpend,
  Program,
  sha256,
  SpendBundle,
  toHex,
} from 'chia-wallet-sdk-wasm';

export interface ParsedSpendBundle {
  coinSpends: ParsedCoinSpend[];
  aggregatedSignature: string;
  fee: string;
}

export interface ParsedCoinSpend {
  coin: ParsedCoin;
  puzzleReveal: string;
  solution: string;
  runtimeCost: string;
  conditions: ParsedCondition[];
}

export interface ParsedCoin {
  coinId: string;
  parentCoinInfo: string;
  puzzleHash: string;
  amount: string;
}

export interface ParsedCondition {
  opcode: string;
  name: string;
  type: ConditionType;
  args: Record<string, ConditionArg>;
}

export enum ConditionType {
  Output,
  Assertion,
  Timelock,
  Announcement,
  Message,
  AggSig,
  Other,
}

export interface ConditionArg {
  value: string;
  type: ConditionArgType;
}

export enum ConditionArgType {
  CoinId,
  Copiable,
  NonCopiable,
  Invalid,
}

export function parseSpendBundle(spendBundle: SpendBundle): ParsedSpendBundle {
  const clvm = new Clvm();

  return {
    coinSpends: spendBundle.coinSpends.map((coinSpend) =>
      parseCoinSpend(clvm, coinSpend),
    ),
    aggregatedSignature: `0x${toHex(spendBundle.aggregatedSignature.toBytes())}`,
    fee: '0',
  };
}

function parseCoinSpend(clvm: Clvm, coinSpend: CoinSpend): ParsedCoinSpend {
  const puzzle = clvm.deserialize(coinSpend.puzzleReveal).puzzle();
  const solution = clvm.deserialize(coinSpend.solution);

  const output = puzzle.program.run(solution, 11_000_000_000n, false);
  const conditions = output.value.toList() ?? [];

  return {
    coin: parseCoin(coinSpend.coin),
    puzzleReveal: toHex(coinSpend.puzzleReveal),
    solution: toHex(coinSpend.solution),
    runtimeCost: output.cost.toString(),
    conditions: conditions.map((condition) =>
      parseCondition(coinSpend.coin, condition),
    ),
  };
}

function parseCoin(coin: Coin): ParsedCoin {
  return {
    coinId: `0x${toHex(coin.coinId())}`,
    parentCoinInfo: `0x${toHex(coin.parentCoinInfo)}`,
    puzzleHash: `0x${toHex(coin.puzzleHash)}`,
    amount: coin.amount.toString(),
  };
}

function parseCondition(coin: Coin, condition: Program): ParsedCondition {
  let name = 'UNKNOWN';
  let type = ConditionType.Other;
  const args: Record<string, ConditionArg> = {};

  const remark = condition.parseRemark();
  if (remark) {
    name = 'REMARK';
    args.rest = {
      value: remark.rest.unparse(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const aggSigParent = condition.parseAggSigParent();
  if (aggSigParent) name = 'AGG_SIG_PARENT';
  const aggSigPuzzle = condition.parseAggSigPuzzle();
  if (aggSigPuzzle) name = 'AGG_SIG_PUZZLE';
  const aggSigAmount = condition.parseAggSigAmount();
  if (aggSigAmount) name = 'AGG_SIG_AMOUNT';
  const aggSigPuzzleAmount = condition.parseAggSigPuzzleAmount();
  if (aggSigPuzzleAmount) name = 'AGG_SIG_PUZZLE_AMOUNT';
  const aggSigParentAmount = condition.parseAggSigParentAmount();
  if (aggSigParentAmount) name = 'AGG_SIG_PARENT_AMOUNT';
  const aggSigParentPuzzle = condition.parseAggSigParentPuzzle();
  if (aggSigParentPuzzle) name = 'AGG_SIG_PARENT_PUZZLE';
  const aggSigUnsafe = condition.parseAggSigUnsafe();
  if (aggSigUnsafe) name = 'AGG_SIG_UNSAFE';
  const aggSigMe = condition.parseAggSigMe();
  if (aggSigMe) name = 'AGG_SIG_ME';

  const aggSig =
    aggSigParent ??
    aggSigPuzzle ??
    aggSigAmount ??
    aggSigPuzzleAmount ??
    aggSigParentAmount ??
    aggSigParentPuzzle ??
    aggSigUnsafe ??
    aggSigMe;

  if (aggSig) {
    type = ConditionType.AggSig;

    args.public_key = {
      value: `0x${toHex(aggSig.publicKey.toBytes())}`,
      type: ConditionArgType.Copiable,
    };
    args.message = {
      value: `0x${toHex(aggSig.message)}`,
      type: ConditionArgType.Copiable,
    };
  }

  const createCoin = condition.parseCreateCoin();
  if (createCoin) {
    type = ConditionType.Output;
    name = 'CREATE_COIN';

    args.coin_id = {
      value: `0x${toHex(new Coin(coin.coinId(), createCoin.puzzleHash, createCoin.amount).coinId())}`,
      type: ConditionArgType.CoinId,
    };

    args.puzzle_hash = {
      value: `0x${toHex(createCoin.puzzleHash)}`,
      type: ConditionArgType.Copiable,
    };

    args.amount = {
      value: createCoin.amount.toString(),
      type: ConditionArgType.NonCopiable,
    };

    if (createCoin.memos) {
      args.memos = {
        value: createCoin.memos.unparse(),
        type: ConditionArgType.NonCopiable,
      };
    }
  }

  const reserveFee = condition.parseReserveFee();
  if (reserveFee) {
    type = ConditionType.Output;
    name = 'RESERVE_FEE';

    args.amount = {
      value: reserveFee.amount.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const createCoinAnnouncement = condition.parseCreateCoinAnnouncement();
  if (createCoinAnnouncement) {
    type = ConditionType.Announcement;
    name = 'CREATE_COIN_ANNOUNCEMENT';

    args.message = {
      value: `0x${toHex(createCoinAnnouncement.message)}`,
      type: ConditionArgType.Copiable,
    };

    args.announcement_id = {
      value: `0x${toHex(sha256(new Uint8Array([...coin.coinId(), ...createCoinAnnouncement.message])))}`,
      type: ConditionArgType.Copiable,
    };
  }

  const assertCoinAnnouncement = condition.parseAssertCoinAnnouncement();
  if (assertCoinAnnouncement) {
    type = ConditionType.Announcement;
    name = 'ASSERT_COIN_ANNOUNCEMENT';

    args.announcement_id = {
      value: `0x${toHex(assertCoinAnnouncement.announcementId)}`,
      type: ConditionArgType.Copiable,
    };
  }

  const createPuzzleAnnouncement = condition.parseCreatePuzzleAnnouncement();
  if (createPuzzleAnnouncement) {
    type = ConditionType.Announcement;
    name = 'CREATE_PUZZLE_ANNOUNCEMENT';

    args.message = {
      value: `0x${toHex(createPuzzleAnnouncement.message)}`,
      type: ConditionArgType.Copiable,
    };
    args.announcement_id = {
      value: `0x${toHex(sha256(new Uint8Array([...coin.puzzleHash, ...createPuzzleAnnouncement.message])))}`,
      type: ConditionArgType.Copiable,
    };
  }

  const assertPuzzleAnnouncement = condition.parseAssertPuzzleAnnouncement();
  if (assertPuzzleAnnouncement) {
    type = ConditionType.Announcement;
    name = 'ASSERT_PUZZLE_ANNOUNCEMENT';

    args.announcement_id = {
      value: `0x${toHex(assertPuzzleAnnouncement.announcementId)}`,
      type: ConditionArgType.Copiable,
    };
  }

  const assertConcurrentSpend = condition.parseAssertConcurrentSpend();
  if (assertConcurrentSpend) {
    type = ConditionType.Assertion;
    name = 'ASSERT_CONCURRENT_SPEND';

    args.coin_id = {
      value: `0x${toHex(assertConcurrentSpend.coinId)}`,
      type: ConditionArgType.CoinId,
    };
  }

  const assertConcurrentPuzzle = condition.parseAssertConcurrentPuzzle();
  if (assertConcurrentPuzzle) {
    type = ConditionType.Assertion;
    name = 'ASSERT_CONCURRENT_PUZZLE';

    args.puzzle_hash = {
      value: `0x${toHex(assertConcurrentPuzzle.puzzleHash)}`,
      type: ConditionArgType.Copiable,
    };
  }

  const sendMessage = condition.parseSendMessage();
  if (sendMessage) {
    type = ConditionType.Message;
    name = 'SEND_MESSAGE';

    args.mode = {
      value: sendMessage.mode.toString(),
      type: ConditionArgType.NonCopiable,
    };
    args.message = {
      value: `0x${toHex(sendMessage.message)}`,
      type: ConditionArgType.Copiable,
    };

    const sender = parseMessageFlags(sendMessage.mode, MessageSide.Sender);
    const receiver = parseMessageFlags(sendMessage.mode, MessageSide.Receiver);

    insertMessageModeData(args, sender, coin, 'sender');
    insertMessageModeData(args, receiver, sendMessage.data, 'receiver');
  }

  const receiveMessage = condition.parseReceiveMessage();
  if (receiveMessage) {
    type = ConditionType.Message;
    name = 'RECEIVE_MESSAGE';

    args.mode = {
      value: receiveMessage.mode.toString(),
      type: ConditionArgType.NonCopiable,
    };
    args.message = {
      value: `0x${toHex(receiveMessage.message)}`,
      type: ConditionArgType.Copiable,
    };

    const sender = parseMessageFlags(receiveMessage.mode, MessageSide.Sender);
    const receiver = parseMessageFlags(
      receiveMessage.mode,
      MessageSide.Receiver,
    );

    insertMessageModeData(args, sender, receiveMessage.data, 'sender');
    insertMessageModeData(args, receiver, coin, 'receiver');
  }

  const assertMyCoinId = condition.parseAssertMyCoinId();
  if (assertMyCoinId) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_COIN_ID';

    args.coin_id = {
      value: `0x${toHex(assertMyCoinId.coinId)}`,
      type: ConditionArgType.CoinId,
    };
  }

  const assertMyParentId = condition.parseAssertMyParentId();
  if (assertMyParentId) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_PARENT_ID';

    args.parent_id = {
      value: `0x${toHex(assertMyParentId.parentId)}`,
      type: ConditionArgType.CoinId,
    };
  }

  const assertMyPuzzleHash = condition.parseAssertMyPuzzleHash();
  if (assertMyPuzzleHash) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_PUZZLE_HASH';

    args.puzzle_hash = {
      value: `0x${toHex(assertMyPuzzleHash.puzzleHash)}`,
      type: ConditionArgType.Copiable,
    };
  }

  const assertMyAmount = condition.parseAssertMyAmount();
  if (assertMyAmount) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_AMOUNT';

    args.amount = {
      value: assertMyAmount.amount.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertMyBirthSeconds = condition.parseAssertMyBirthSeconds();
  if (assertMyBirthSeconds) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_BIRTH_SECONDS';

    args.seconds = {
      value: assertMyBirthSeconds.seconds.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertMyBirthHeight = condition.parseAssertMyBirthHeight();
  if (assertMyBirthHeight) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_BIRTH_HEIGHT';

    args.height = {
      value: assertMyBirthHeight.height.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertEphemeral = condition.parseAssertEphemeral();
  if (assertEphemeral) {
    type = ConditionType.Assertion;
    name = 'ASSERT_EPHEMERAL';
  }

  const assertSecondsRelative = condition.parseAssertSecondsRelative();
  if (assertSecondsRelative) {
    type = ConditionType.Timelock;
    name = 'ASSERT_SECONDS_RELATIVE';

    args.seconds = {
      value: assertSecondsRelative.seconds.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertHeightRelative = condition.parseAssertHeightRelative();
  if (assertHeightRelative) {
    type = ConditionType.Timelock;
    name = 'ASSERT_HEIGHT_RELATIVE';

    args.height = {
      value: assertHeightRelative.height.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertSecondsAbsolute = condition.parseAssertSecondsAbsolute();
  if (assertSecondsAbsolute) {
    type = ConditionType.Timelock;
    name = 'ASSERT_SECONDS_ABSOLUTE';

    args.seconds = {
      value: assertSecondsAbsolute.seconds.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertHeightAbsolute = condition.parseAssertHeightAbsolute();
  if (assertHeightAbsolute) {
    type = ConditionType.Timelock;
    name = 'ASSERT_HEIGHT_ABSOLUTE';

    args.height = {
      value: assertHeightAbsolute.height.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertBeforeSecondsRelative =
    condition.parseAssertBeforeSecondsRelative();
  if (assertBeforeSecondsRelative) {
    type = ConditionType.Timelock;
    name = 'ASSERT_BEFORE_SECONDS_RELATIVE';

    args.seconds = {
      value: assertBeforeSecondsRelative.seconds.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertBeforeHeightRelative =
    condition.parseAssertBeforeHeightRelative();
  if (assertBeforeHeightRelative) {
    type = ConditionType.Timelock;
    name = 'ASSERT_BEFORE_HEIGHT_RELATIVE';

    args.height = {
      value: assertBeforeHeightRelative.height.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertBeforeSecondsAbsolute =
    condition.parseAssertBeforeSecondsAbsolute();
  if (assertBeforeSecondsAbsolute) {
    type = ConditionType.Timelock;
    name = 'ASSERT_BEFORE_SECONDS_ABSOLUTE';

    args.seconds = {
      value: assertBeforeSecondsAbsolute.seconds.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const assertBeforeHeightAbsolute =
    condition.parseAssertBeforeHeightAbsolute();
  if (assertBeforeHeightAbsolute) {
    type = ConditionType.Timelock;
    name = 'ASSERT_BEFORE_HEIGHT_ABSOLUTE';

    args.height = {
      value: assertBeforeHeightAbsolute.height.toString(),
      type: ConditionArgType.NonCopiable,
    };
  }

  const softfork = condition.parseSoftfork();
  if (softfork) {
    name = 'SOFTFORK';

    args.cost = {
      value: softfork.cost.toString(),
      type: ConditionArgType.NonCopiable,
    };

    args.rest = {
      value: softfork.rest.unparse(),
      type: ConditionArgType.NonCopiable,
    };
  }

  return {
    opcode: condition.first().toInt()?.toString() ?? '',
    name,
    type,
    args,
  };
}

enum MessageSide {
  Sender,
  Receiver,
}

interface MessageFlags {
  parent: boolean;
  puzzle: boolean;
  amount: boolean;
}

function parseMessageFlags(mode: number, side: MessageSide): MessageFlags {
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

function insertMessageModeData(
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
            type: ConditionArgType.CoinId,
          }
        : {
            value: 'Missing',
            type: ConditionArgType.Invalid,
          };
    } else {
      if (flags.parent && flags.puzzle) {
        const parentCoinId = data[0]?.toAtom();
        const puzzleHash = data[1]?.toAtom();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? {
              value: `0x${toHex(parentCoinId)}`,
              type: ConditionArgType.CoinId,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? {
              value: `0x${toHex(puzzleHash)}`,
              type: ConditionArgType.Copiable,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
      } else if (flags.parent && flags.amount) {
        const parentCoinId = data[0]?.toAtom();
        const amount = data[1]?.toInt();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? {
              value: `0x${toHex(parentCoinId)}`,
              type: ConditionArgType.CoinId,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
        args[`${prefix}_amount`] = amount
          ? {
              value: amount.toString(),
              type: ConditionArgType.NonCopiable,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
      } else if (flags.puzzle && flags.amount) {
        const puzzleHash = data[0]?.toAtom();
        const amount = data[1]?.toInt();
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? {
              value: `0x${toHex(puzzleHash)}`,
              type: ConditionArgType.Copiable,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
        args[`${prefix}_amount`] = amount
          ? {
              value: amount.toString(),
              type: ConditionArgType.NonCopiable,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
      } else if (flags.parent) {
        const parentCoinId = data[0]?.toAtom();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? {
              value: `0x${toHex(parentCoinId)}`,
              type: ConditionArgType.CoinId,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
      } else if (flags.puzzle) {
        const puzzleHash = data[0]?.toAtom();
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? {
              value: `0x${toHex(puzzleHash)}`,
              type: ConditionArgType.Copiable,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
      } else if (flags.amount) {
        const amount = data[0]?.toInt();
        args[`${prefix}_amount`] = amount
          ? {
              value: amount.toString(),
              type: ConditionArgType.NonCopiable,
            }
          : {
              value: 'Missing',
              type: ConditionArgType.Invalid,
            };
      }
    }

    return;
  }

  if (flags.parent && flags.puzzle && flags.amount) {
    args[`${prefix}_coin_id`] = {
      value: `0x${toHex(data.coinId())}`,
      type: ConditionArgType.CoinId,
    };
  } else {
    if (flags.parent) {
      args[`${prefix}_parent_coin_id`] = {
        value: `0x${toHex(data.parentCoinInfo)}`,
        type: ConditionArgType.CoinId,
      };
    }
    if (flags.puzzle) {
      args[`${prefix}_puzzle_hash`] = {
        value: `0x${toHex(data.puzzleHash)}`,
        type: ConditionArgType.Copiable,
      };
    }
    if (flags.amount) {
      args[`${prefix}_amount`] = {
        value: data.amount.toString(),
        type: ConditionArgType.NonCopiable,
      };
    }
  }
}
