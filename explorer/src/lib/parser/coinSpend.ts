import { bytesEqual, Constants, toHex } from 'chia-wallet-sdk-wasm';
import { parseCoin, ParsedCoin } from './coin';
import { parseCondition, ParsedCondition } from './conditions';
import { ParserContext } from './context';
import { DeserializedCoinSpend } from './deserializedCoinSpend';
import { MessageSide, parseMessageFlags } from './messages';

export interface ParsedCoinSpend {
  coin: ParsedCoin;
  puzzleReveal: string;
  solution: string;
  cost: string;
  conditions: ParsedCondition[];
}

export function parseCoinSpend(
  { coinSpend, cost, puzzle, conditions }: DeserializedCoinSpend,
  ctx: ParserContext,
): ParsedCoinSpend {
  const coinId = coinSpend.coin.coinId();

  let isFastForwardable =
    bytesEqual(puzzle.modHash, Constants.singletonTopLayerV11Hash()) &&
    coinSpend.coin.amount % 2n === 1n &&
    !ctx.createdCoinIds.has(toHex(coinId)) &&
    !ctx.assertedCoinIds.has(toHex(coinId));

  if (isFastForwardable) {
    let hasIdenticalOutput = false;

    for (const condition of conditions.slice(2)) {
      const disqualifyingCondition =
        condition.parseAssertMyCoinId() ??
        condition.parseAssertMyParentId() ??
        condition.parseAssertHeightRelative() ??
        condition.parseAssertSecondsRelative() ??
        condition.parseAssertBeforeHeightRelative() ??
        condition.parseAssertBeforeSecondsRelative() ??
        condition.parseAssertMyBirthHeight() ??
        condition.parseAssertMyBirthSeconds() ??
        condition.parseAssertEphemeral() ??
        condition.parseAggSigPuzzle() ??
        condition.parseAggSigParent() ??
        condition.parseAggSigParentAmount() ??
        condition.parseAggSigParentPuzzle() ??
        condition.parseCreateCoinAnnouncement();

      if (disqualifyingCondition) {
        isFastForwardable = false;
      }

      const sendMessage = condition.parseSendMessage();
      if (sendMessage) {
        const sender = parseMessageFlags(sendMessage.mode, MessageSide.Sender);

        if (sender.parent) {
          isFastForwardable = false;
        }
      }

      const receiveMessage = condition.parseReceiveMessage();
      if (receiveMessage) {
        const receiver = parseMessageFlags(
          receiveMessage.mode,
          MessageSide.Receiver,
        );

        if (receiver.parent) {
          isFastForwardable = false;
        }
      }

      const createCoin = condition.parseCreateCoin();
      if (createCoin) {
        if (
          bytesEqual(createCoin.puzzleHash, coinSpend.coin.puzzleHash) &&
          createCoin.amount === coinSpend.coin.amount
        ) {
          hasIdenticalOutput = true;
        }
      }
    }

    if (!hasIdenticalOutput) {
      isFastForwardable = false;
    }
  }

  return {
    coin: parseCoin(coinSpend.coin),
    puzzleReveal: toHex(coinSpend.puzzleReveal),
    solution: toHex(coinSpend.solution),
    cost: cost.toLocaleString(),
    conditions: conditions.map((condition) =>
      parseCondition(coinSpend.coin, condition, ctx, isFastForwardable),
    ),
  };
}
