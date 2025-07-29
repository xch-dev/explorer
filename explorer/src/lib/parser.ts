import {
  Clvm,
  Coin,
  CoinSpend,
  Program,
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
  type: string;
  args: Record<string, string>;
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
  let type = 'UNKNOWN';
  const args: Record<string, string> = {};

  const remark = condition.parseRemark();
  if (remark) {
    type = 'REMARK';
    args.rest = remark.rest.unparse();
  }

  const aggSigParent = condition.parseAggSigParent();
  if (aggSigParent) type = 'AGG_SIG_PARENT';
  const aggSigPuzzle = condition.parseAggSigPuzzle();
  if (aggSigPuzzle) type = 'AGG_SIG_PUZZLE';
  const aggSigAmount = condition.parseAggSigAmount();
  if (aggSigAmount) type = 'AGG_SIG_AMOUNT';
  const aggSigPuzzleAmount = condition.parseAggSigPuzzleAmount();
  if (aggSigPuzzleAmount) type = 'AGG_SIG_PUZZLE_AMOUNT';
  const aggSigParentAmount = condition.parseAggSigParentAmount();
  if (aggSigParentAmount) type = 'AGG_SIG_PARENT_AMOUNT';
  const aggSigParentPuzzle = condition.parseAggSigParentPuzzle();
  if (aggSigParentPuzzle) type = 'AGG_SIG_PARENT_PUZZLE';
  const aggSigUnsafe = condition.parseAggSigUnsafe();
  if (aggSigUnsafe) type = 'AGG_SIG_UNSAFE';
  const aggSigMe = condition.parseAggSigMe();
  if (aggSigMe) type = 'AGG_SIG_ME';

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
    args.public_key = `0x${toHex(aggSig.publicKey.toBytes())}`;
    args.message = `0x${toHex(aggSig.message)}`;
  }

  const createCoin = condition.parseCreateCoin();
  if (createCoin) {
    type = 'CREATE_COIN';
    args.puzzle_hash = `0x${toHex(createCoin.puzzleHash)}`;
    args.amount = createCoin.amount.toString();
    if (createCoin.memos) args.memos = createCoin.memos.unparse();
  }

  const reserveFee = condition.parseReserveFee();
  if (reserveFee) {
    type = 'RESERVE_FEE';
    args.amount = reserveFee.amount.toString();
  }

  const createCoinAnnouncement = condition.parseCreateCoinAnnouncement();
  if (createCoinAnnouncement) {
    type = 'CREATE_COIN_ANNOUNCEMENT';
    args.message = `0x${toHex(createCoinAnnouncement.message)}`;
  }

  const assertCoinAnnouncement = condition.parseAssertCoinAnnouncement();
  if (assertCoinAnnouncement) {
    type = 'ASSERT_COIN_ANNOUNCEMENT';
    args.announcement_id = `0x${toHex(assertCoinAnnouncement.announcementId)}`;
  }

  const createPuzzleAnnouncement = condition.parseCreatePuzzleAnnouncement();
  if (createPuzzleAnnouncement) {
    type = 'CREATE_PUZZLE_ANNOUNCEMENT';
    args.message = `0x${toHex(createPuzzleAnnouncement.message)}`;
  }

  const assertPuzzleAnnouncement = condition.parseAssertPuzzleAnnouncement();
  if (assertPuzzleAnnouncement) {
    type = 'ASSERT_PUZZLE_ANNOUNCEMENT';
    args.announcement_id = `0x${toHex(assertPuzzleAnnouncement.announcementId)}`;
  }

  const assertConcurrentSpend = condition.parseAssertConcurrentSpend();
  if (assertConcurrentSpend) {
    type = 'ASSERT_CONCURRENT_SPEND';
    args.coin_id = `0x${toHex(assertConcurrentSpend.coinId)}`;
  }

  const assertConcurrentPuzzle = condition.parseAssertConcurrentPuzzle();
  if (assertConcurrentPuzzle) {
    type = 'ASSERT_CONCURRENT_PUZZLE';
    args.puzzle_hash = `0x${toHex(assertConcurrentPuzzle.puzzleHash)}`;
  }

  const sendMessage = condition.parseSendMessage();
  if (sendMessage) {
    type = 'SEND_MESSAGE';
    args.mode = sendMessage.mode.toString();
    args.message = `0x${toHex(sendMessage.message)}`;

    const sender = parseMessageFlags(sendMessage.mode, MessageSide.Sender);
    const receiver = parseMessageFlags(sendMessage.mode, MessageSide.Receiver);

    insertMessageModeData(args, sender, coin, 'sender');
    insertMessageModeData(args, receiver, sendMessage.data, 'receiver');
  }

  const receiveMessage = condition.parseReceiveMessage();
  if (receiveMessage) {
    type = 'RECEIVE_MESSAGE';
    args.mode = receiveMessage.mode.toString();
    args.message = `0x${toHex(receiveMessage.message)}`;

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
    type = 'ASSERT_MY_COIN_ID';
    args.coin_id = `0x${toHex(assertMyCoinId.coinId)}`;
  }

  const assertMyParentId = condition.parseAssertMyParentId();
  if (assertMyParentId) {
    type = 'ASSERT_MY_PARENT_ID';
    args.parent_id = `0x${toHex(assertMyParentId.parentId)}`;
  }

  const assertMyPuzzleHash = condition.parseAssertMyPuzzleHash();
  if (assertMyPuzzleHash) {
    type = 'ASSERT_MY_PUZZLE_HASH';
    args.puzzle_hash = `0x${toHex(assertMyPuzzleHash.puzzleHash)}`;
  }

  const assertMyAmount = condition.parseAssertMyAmount();
  if (assertMyAmount) {
    type = 'ASSERT_MY_AMOUNT';
    args.amount = assertMyAmount.amount.toString();
  }

  const assertMyBirthSeconds = condition.parseAssertMyBirthSeconds();
  if (assertMyBirthSeconds) {
    type = 'ASSERT_MY_BIRTH_SECONDS';
    args.seconds = assertMyBirthSeconds.seconds.toString();
  }

  const assertMyBirthHeight = condition.parseAssertMyBirthHeight();
  if (assertMyBirthHeight) {
    type = 'ASSERT_MY_BIRTH_HEIGHT';
    args.height = assertMyBirthHeight.height.toString();
  }

  const assertEphemeral = condition.parseAssertEphemeral();
  if (assertEphemeral) {
    type = 'ASSERT_EPHEMERAL';
  }

  const assertSecondsRelative = condition.parseAssertSecondsRelative();
  if (assertSecondsRelative) {
    type = 'ASSERT_SECONDS_RELATIVE';
    args.seconds = assertSecondsRelative.seconds.toString();
  }

  const assertHeightRelative = condition.parseAssertHeightRelative();
  if (assertHeightRelative) {
    type = 'ASSERT_HEIGHT_RELATIVE';
    args.height = assertHeightRelative.height.toString();
  }

  const assertSecondsAbsolute = condition.parseAssertSecondsAbsolute();
  if (assertSecondsAbsolute) {
    type = 'ASSERT_SECONDS_ABSOLUTE';
    args.seconds = assertSecondsAbsolute.seconds.toString();
  }

  const assertHeightAbsolute = condition.parseAssertHeightAbsolute();
  if (assertHeightAbsolute) {
    type = 'ASSERT_HEIGHT_ABSOLUTE';
    args.height = assertHeightAbsolute.height.toString();
  }

  const assertBeforeSecondsRelative =
    condition.parseAssertBeforeSecondsRelative();
  if (assertBeforeSecondsRelative) {
    type = 'ASSERT_BEFORE_SECONDS_RELATIVE';
    args.seconds = assertBeforeSecondsRelative.seconds.toString();
  }

  const assertBeforeHeightRelative =
    condition.parseAssertBeforeHeightRelative();
  if (assertBeforeHeightRelative) {
    type = 'ASSERT_BEFORE_HEIGHT_RELATIVE';
    args.height = assertBeforeHeightRelative.height.toString();
  }

  const assertBeforeSecondsAbsolute =
    condition.parseAssertBeforeSecondsAbsolute();
  if (assertBeforeSecondsAbsolute) {
    type = 'ASSERT_BEFORE_SECONDS_ABSOLUTE';
    args.seconds = assertBeforeSecondsAbsolute.seconds.toString();
  }

  const assertBeforeHeightAbsolute =
    condition.parseAssertBeforeHeightAbsolute();
  if (assertBeforeHeightAbsolute) {
    type = 'ASSERT_BEFORE_HEIGHT_ABSOLUTE';
    args.height = assertBeforeHeightAbsolute.height.toString();
  }

  const softfork = condition.parseSoftfork();
  if (softfork) {
    type = 'SOFTFORK';
    args.cost = softfork.cost.toString();
    args.rest = softfork.rest.unparse();
  }

  return { opcode: condition.first().toInt()?.toString() ?? '', type, args };
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
  args: Record<string, string>,
  flags: MessageFlags,
  data: Coin | Program[],
  prefix: string,
) {
  if (Array.isArray(data)) {
    if (flags.parent && flags.puzzle && flags.amount) {
      const coinId = data[0]?.toAtom();
      args[`${prefix}_coin_id`] = coinId ? `0x${toHex(coinId)}` : 'Missing';
    } else {
      if (flags.parent && flags.puzzle) {
        const parentCoinId = data[0]?.toAtom();
        const puzzleHash = data[1]?.toAtom();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? `0x${toHex(parentCoinId)}`
          : 'Missing';
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? `0x${toHex(puzzleHash)}`
          : 'Missing';
      } else if (flags.parent && flags.amount) {
        const parentCoinId = data[0]?.toAtom();
        const amount = data[1]?.toInt();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? `0x${toHex(parentCoinId)}`
          : 'Missing';
        args[`${prefix}_amount`] = amount ? amount.toString() : 'Missing';
      } else if (flags.puzzle && flags.amount) {
        const puzzleHash = data[0]?.toAtom();
        const amount = data[1]?.toInt();
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? `0x${toHex(puzzleHash)}`
          : 'Missing';
        args[`${prefix}_amount`] = amount ? amount.toString() : 'Missing';
      } else if (flags.parent) {
        const parentCoinId = data[0]?.toAtom();
        args[`${prefix}_parent_coin_id`] = parentCoinId
          ? `0x${toHex(parentCoinId)}`
          : 'Missing';
      } else if (flags.puzzle) {
        const puzzleHash = data[0]?.toAtom();
        args[`${prefix}_puzzle_hash`] = puzzleHash
          ? `0x${toHex(puzzleHash)}`
          : 'Missing';
      } else if (flags.amount) {
        const amount = data[0]?.toInt();
        args[`${prefix}_amount`] = amount ? amount.toString() : 'Missing';
      }
    }

    return;
  }

  if (flags.parent && flags.puzzle && flags.amount) {
    args[`${prefix}_coin_id`] = `0x${toHex(data.coinId())}`;
  } else {
    if (flags.parent) {
      args[`${prefix}_parent_coin_id`] = `0x${toHex(data.parentCoinInfo)}`;
    }
    if (flags.puzzle) {
      args[`${prefix}_puzzle_hash`] = `0x${toHex(data.puzzleHash)}`;
    }
    if (flags.amount) {
      args[`${prefix}_amount`] = data.amount.toString();
    }
  }
}
