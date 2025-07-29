import { CoinSpend, Program, Puzzle } from 'chia-wallet-sdk-wasm';

export interface DeserializedCoinSpend {
  coinSpend: CoinSpend;
  puzzle: Puzzle;
  solution: Program;
  conditions: Program[];
  cost: bigint;
}
