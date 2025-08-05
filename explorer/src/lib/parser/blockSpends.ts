import { Coin, CoinSpend, Signature, SpendBundle } from 'chia-wallet-sdk-wasm';
import { CoinType, parseCoin, ParsedCoin } from './coin';
import { ParsedSpendBundle, parseSpendBundle } from './spendBundle';

export interface ParsedBlockSpends {
  spendBundle: ParsedSpendBundle;
  additions: ParsedCoin[];
  removals: ParsedCoin[];
}

export function parseBlockSpends(
  rewardCoins: Coin[],
  blockSpends: CoinSpend[],
): ParsedBlockSpends {
  const spendBundle = parseSpendBundle(
    new SpendBundle(blockSpends, Signature.infinity()),
    true,
  );

  return {
    spendBundle,
    additions: rewardCoins
      .map((coin) => parseCoin(coin, CoinType.Reward, 'xch'))
      .concat(spendBundle.coinSpends.flatMap((coinSpend) => coinSpend.outputs)),
    removals: spendBundle.coinSpends.map((coinSpend) => coinSpend.coin),
  };
}
