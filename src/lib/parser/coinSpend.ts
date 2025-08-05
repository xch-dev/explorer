import {
  bytesEqual,
  Coin,
  Constants,
  Puzzle,
  toHex,
} from 'chia-wallet-sdk-wasm';
import { toAddress } from '../conversions';
import { CoinType, parseCoin, ParsedCoin } from './coin';
import { parseCondition, ParsedCondition } from './conditions';
import { ParserContext } from './context';
import { DeserializedCoinSpend } from './deserializedCoinSpend';
import { ParsedLayer, parseLayer } from './layers';
import { MessageSide, parseMessageFlags } from './messages';

export interface ParsedCoinSpend {
  coin: ParsedCoin;
  puzzleReveal: string;
  solution: string;
  cost: string;
  conditions: ParsedCondition[];
  layer: ParsedLayer;
  outputs: ParsedCoin[];
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
        condition.parseAggSigMe() ??
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

  let assetId = 'xch';
  let type = CoinType.Unknown;

  const cat = puzzle.parseCat();
  if (cat) {
    assetId = `0x${toHex(cat.info.assetId)}`;
    type = CoinType.Cat;
  }

  const singleton = parseSingleton(puzzle);
  if (singleton) {
    assetId = toAddress(toHex(singleton), 'vault');
    type = CoinType.Vault;
  }

  const nft = puzzle.parseNft();
  if (nft) {
    assetId = toAddress(toHex(nft.info.launcherId), 'nft');
    type = CoinType.Nft;
  }

  const did = puzzle.parseDid();
  if (did) {
    assetId = toAddress(toHex(did.info.launcherId), 'did:chia:');
    type = CoinType.Did;
  }

  const outputs: ParsedCoin[] = [];

  for (const condition of conditions) {
    const createCoin = condition.parseCreateCoin();
    if (!createCoin) continue;

    const child = new Coin(
      coinSpend.coin.coinId(),
      createCoin.puzzleHash,
      createCoin.amount,
    );

    const preserveType = child.amount % 2n === 1n || cat;

    const hint = createCoin.memos?.toList()?.[0]?.toAtom();

    outputs.push(
      parseCoin(
        child,
        preserveType ? type : CoinType.Unknown,
        preserveType ? assetId : 'xch',
        hint?.length === 32 ? toHex(hint) : undefined,
      ),
    );
  }

  return {
    coin: parseCoin(coinSpend.coin, type, assetId),
    puzzleReveal: toHex(coinSpend.puzzleReveal),
    solution: toHex(coinSpend.solution),
    cost: cost.toLocaleString(),
    conditions: conditions.map((condition) =>
      parseCondition(coinSpend.coin, condition, ctx, isFastForwardable),
    ),
    layer: parseLayer(puzzle),
    outputs,
  };
}

function parseSingleton(puzzle: Puzzle) {
  if (!bytesEqual(puzzle.modHash, Constants.singletonTopLayerV11Hash())) {
    return undefined;
  }

  const singletonStruct = puzzle.program.uncurry()?.args[0];
  const pair = singletonStruct?.toPair()?.rest.toPair();
  const launcherId = pair?.first.toAtom();

  return launcherId;
}
