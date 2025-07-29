import { bytesEqual, Coin, Program, sha256, toHex } from 'chia-wallet-sdk-wasm';
import { ParserContext } from './context';
import {
  insertMessageModeData,
  MessageSide,
  parseMessageFlags,
} from './messages';

export interface ParsedCondition {
  opcode: string;
  name: string;
  type: ConditionType;
  args: Record<string, ConditionArg>;
  warning: string | null;
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
}

export function parseCondition(
  coin: Coin,
  condition: Program,
  ctx: ParserContext,
  isFastForwardable: boolean,
): ParsedCondition {
  let name = 'UNKNOWN';
  let type = ConditionType.Other;
  let warning: string | null = null;

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

    args.coin_id = {
      value: `0x${toHex(coin.coinId())}`,
      type: ConditionArgType.CoinId,
    };

    args.message = {
      value: `0x${toHex(createCoinAnnouncement.message)}`,
      type: ConditionArgType.Copiable,
    };

    const announcementId = toHex(
      sha256(
        new Uint8Array([...coin.coinId(), ...createCoinAnnouncement.message]),
      ),
    );

    args.announcement_id = {
      value: `0x${announcementId}`,
      type: ConditionArgType.Copiable,
    };

    if (
      !ctx.coinAnnouncementAssertions.has(announcementId) &&
      ctx.selfContained
    ) {
      warning = 'Not asserted';
    }
  }

  const assertCoinAnnouncement = condition.parseAssertCoinAnnouncement();
  if (assertCoinAnnouncement) {
    type = ConditionType.Announcement;
    name = 'ASSERT_COIN_ANNOUNCEMENT';

    const announcementId = toHex(assertCoinAnnouncement.announcementId);

    if (ctx.announcementCoinIds[announcementId]) {
      args.coin_id = {
        value: `0x${toHex(ctx.announcementCoinIds[announcementId])}`,
        type: ConditionArgType.CoinId,
      };
    } else if (ctx.selfContained) {
      warning = 'Announcement does not exist';
    }

    if (ctx.announcementMessages[announcementId]) {
      args.message = {
        value: `0x${toHex(ctx.announcementMessages[announcementId])}`,
        type: ConditionArgType.Copiable,
      };
    }

    args.announcement_id = {
      value: `0x${announcementId}`,
      type: ConditionArgType.Copiable,
    };
  }

  const createPuzzleAnnouncement = condition.parseCreatePuzzleAnnouncement();
  if (createPuzzleAnnouncement) {
    type = ConditionType.Announcement;
    name = 'CREATE_PUZZLE_ANNOUNCEMENT';

    args.puzzle_hash = {
      value: `0x${toHex(coin.puzzleHash)}`,
      type: ConditionArgType.Copiable,
    };

    args.message = {
      value: `0x${toHex(createPuzzleAnnouncement.message)}`,
      type: ConditionArgType.Copiable,
    };

    const announcementId = toHex(
      sha256(
        new Uint8Array([
          ...coin.puzzleHash,
          ...createPuzzleAnnouncement.message,
        ]),
      ),
    );

    args.announcement_id = {
      value: `0x${announcementId}`,
      type: ConditionArgType.Copiable,
    };

    if (
      !ctx.puzzleAnnouncementAssertions.has(announcementId) &&
      ctx.selfContained
    ) {
      warning = 'Not asserted';
    }
  }

  const assertPuzzleAnnouncement = condition.parseAssertPuzzleAnnouncement();
  if (assertPuzzleAnnouncement) {
    type = ConditionType.Announcement;
    name = 'ASSERT_PUZZLE_ANNOUNCEMENT';

    const announcementId = toHex(assertPuzzleAnnouncement.announcementId);

    if (ctx.announcementPuzzleHashes[announcementId]) {
      args.puzzle_hash = {
        value: `0x${toHex(ctx.announcementPuzzleHashes[announcementId])}`,
        type: ConditionArgType.Copiable,
      };
    } else if (ctx.selfContained) {
      warning = 'Announcement does not exist';
    }

    if (ctx.announcementMessages[announcementId]) {
      args.message = {
        value: `0x${toHex(ctx.announcementMessages[announcementId])}`,
        type: ConditionArgType.Copiable,
      };
    }

    args.announcement_id = {
      value: `0x${announcementId}`,
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

    if (
      !ctx.spentCoinIds.has(toHex(assertConcurrentSpend.coinId)) &&
      ctx.selfContained
    ) {
      warning = 'Coin not spent';
    }
  }

  const assertConcurrentPuzzle = condition.parseAssertConcurrentPuzzle();
  if (assertConcurrentPuzzle) {
    type = ConditionType.Assertion;
    name = 'ASSERT_CONCURRENT_PUZZLE';

    args.puzzle_hash = {
      value: `0x${toHex(assertConcurrentPuzzle.puzzleHash)}`,
      type: ConditionArgType.Copiable,
    };

    if (
      !ctx.spentPuzzleHashes.has(toHex(assertConcurrentPuzzle.puzzleHash)) &&
      ctx.selfContained
    ) {
      warning = 'Puzzle not spent';
    }
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

    if (!bytesEqual(coin.parentCoinInfo, assertMyParentId.parentId)) {
      warning = isFastForwardable
        ? 'This spend will need to be fast forwarded'
        : 'Parent ID does not match, and this spend cannot be fast forwarded';
    }
  }

  const assertMyPuzzleHash = condition.parseAssertMyPuzzleHash();
  if (assertMyPuzzleHash) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_PUZZLE_HASH';

    args.puzzle_hash = {
      value: `0x${toHex(assertMyPuzzleHash.puzzleHash)}`,
      type: ConditionArgType.Copiable,
    };

    if (!bytesEqual(coin.puzzleHash, assertMyPuzzleHash.puzzleHash)) {
      warning = 'Puzzle hash does not match';
    }
  }

  const assertMyAmount = condition.parseAssertMyAmount();
  if (assertMyAmount) {
    type = ConditionType.Assertion;
    name = 'ASSERT_MY_AMOUNT';

    args.amount = {
      value: assertMyAmount.amount.toString(),
      type: ConditionArgType.NonCopiable,
    };

    if (coin.amount !== assertMyAmount.amount) {
      warning = 'Amount does not match';
    }
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

    if (!ctx.createdCoinIds.has(toHex(coin.coinId())) && ctx.selfContained) {
      warning = 'Coin not created ephemerally in this bundle';
    }
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
    warning,
  };
}
