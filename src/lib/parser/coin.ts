import { Coin, toHex } from 'chia-wallet-sdk-wasm';

export interface ParsedCoin {
  coinId: string;
  parentCoinInfo: string;
  puzzleHash: string;
  amount: string;
  type: CoinType;
  assetId: string;
  hint?: string;
}

export enum CoinType {
  Unknown = 'unknown',
  Reward = 'reward',
  Cat = 'cat',
  Nft = 'nft',
  Did = 'did',
  Vault = 'vault',
}

export function parseCoin(
  coin: Coin,
  type: CoinType,
  assetId: string,
  hint?: string,
): ParsedCoin {
  return {
    coinId: `0x${toHex(coin.coinId())}`,
    parentCoinInfo: `0x${toHex(coin.parentCoinInfo)}`,
    puzzleHash: `0x${toHex(coin.puzzleHash)}`,
    amount: coin.amount.toString(),
    type,
    assetId,
    hint,
  };
}
