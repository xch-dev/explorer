import { Clvm, Coin, sha256, SpendBundle, toHex } from 'chia-wallet-sdk-wasm';
import { COST_PER_BYTE } from '../constants';
import { parseCoinSpend, ParsedCoinSpend } from './coinSpend';
import { ParserContext } from './context';
import { DeserializedCoinSpend } from './deserializedCoinSpend';

export interface ParsedSpendBundle {
  coinSpends: ParsedCoinSpend[];
  aggregatedSignature: string;
  fee: string;
  totalCost: string;
  hash: string;
}

export function parseSpendBundle(
  spendBundle: SpendBundle,
  selfContained: boolean,
): ParsedSpendBundle {
  const clvm = new Clvm();

  const deserializedCoinSpends: DeserializedCoinSpend[] = [];
  const announcements: ParserContext = {
    selfContained,
    announcementCoinIds: {},
    announcementPuzzleHashes: {},
    announcementMessages: {},
    coinAnnouncementAssertions: new Set(),
    puzzleAnnouncementAssertions: new Set(),
    spentCoinIds: new Set(),
    spentPuzzleHashes: new Set(),
    createdCoinIds: new Set(),
    assertedCoinIds: new Set(),
  };

  for (const coinSpend of spendBundle.coinSpends) {
    const puzzle = clvm.deserialize(coinSpend.puzzleReveal).puzzle();
    const solution = clvm.deserialize(coinSpend.solution);

    const output = puzzle.program.run(solution, 11_000_000_000n, false);
    const conditions = output.value.toList() ?? [];

    const coinId = coinSpend.coin.coinId();
    const puzzleHash = coinSpend.coin.puzzleHash;

    announcements.spentCoinIds.add(toHex(coinId));
    announcements.spentPuzzleHashes.add(toHex(puzzleHash));

    let cost =
      output.cost +
      COST_PER_BYTE *
        BigInt(coinSpend.puzzleReveal.length + coinSpend.solution.length);

    for (const condition of conditions) {
      const createCoinAnnouncement = condition.parseCreateCoinAnnouncement();
      if (createCoinAnnouncement) {
        const message = createCoinAnnouncement.message;
        const announcementId = sha256(new Uint8Array([...coinId, ...message]));
        announcements.announcementCoinIds[toHex(announcementId)] = coinId;
        announcements.announcementMessages[toHex(announcementId)] = message;
      }

      const createPuzzleAnnouncement =
        condition.parseCreatePuzzleAnnouncement();
      if (createPuzzleAnnouncement) {
        const message = createPuzzleAnnouncement.message;
        const announcementId = sha256(
          new Uint8Array([...puzzleHash, ...message]),
        );
        announcements.announcementPuzzleHashes[toHex(announcementId)] =
          puzzleHash;
        announcements.announcementMessages[toHex(announcementId)] = message;
      }

      const assertCoinAnnouncement = condition.parseAssertCoinAnnouncement();
      if (assertCoinAnnouncement) {
        announcements.coinAnnouncementAssertions.add(
          toHex(assertCoinAnnouncement.announcementId),
        );
      }

      const assertPuzzleAnnouncement =
        condition.parseAssertPuzzleAnnouncement();
      if (assertPuzzleAnnouncement) {
        announcements.puzzleAnnouncementAssertions.add(
          toHex(assertPuzzleAnnouncement.announcementId),
        );
      }

      const createCoin = condition.parseCreateCoin();
      if (createCoin) {
        announcements.createdCoinIds.add(
          toHex(
            new Coin(coinId, createCoin.puzzleHash, createCoin.amount).coinId(),
          ),
        );
        cost += 1_800_000n;
      }

      const assertConcurrentSpend = condition.parseAssertConcurrentSpend();
      if (assertConcurrentSpend) {
        announcements.assertedCoinIds.add(toHex(assertConcurrentSpend.coinId));
      }

      const aggSig =
        condition.parseAggSigParent() ??
        condition.parseAggSigPuzzle() ??
        condition.parseAggSigAmount() ??
        condition.parseAggSigPuzzleAmount() ??
        condition.parseAggSigParentAmount() ??
        condition.parseAggSigParentPuzzle() ??
        condition.parseAggSigUnsafe() ??
        condition.parseAggSigMe();

      if (aggSig) {
        cost += 1_200_000n;
      }
    }

    deserializedCoinSpends.push({
      coinSpend,
      puzzle,
      solution,
      conditions,
      cost,
    });
  }

  return {
    coinSpends: deserializedCoinSpends.map((coinSpend) =>
      parseCoinSpend(coinSpend, announcements),
    ),
    aggregatedSignature: `0x${toHex(spendBundle.aggregatedSignature.toBytes())}`,
    fee: '0',
    totalCost: deserializedCoinSpends
      .reduce((acc, coinSpend) => acc + coinSpend.cost, 0n)
      .toLocaleString(),
    hash: `0x${toHex(spendBundle.hash())}`,
  };
}
