import { parse } from './json';

const API_URL: string = import.meta.env.VITE_API_URL;

function apiUrl(path: string) {
  return new URL(path, API_URL).href;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  const text = await response.text();
  return parse(text);
}

export interface BlockRecord {
  height: number;
  header_hash: string;
  weight: number | bigint;
  total_iters: number | bigint;
  farmer_puzzle_hash: string;
  pool_puzzle_hash: string | null;
  prev_block_hash: string;
  transaction_info: TransactionInfo | null;
}

export interface TransactionInfo {
  timestamp: number;
  fees: number | bigint;
  cost: number;
  additions: number;
  removals: number;
  prev_transaction_block_hash: string;
}

export type CoinRecord = {
  coin_id: string;
  coin: Coin;
  created_height: number;
  spent_height: number | null;
  hint: string | null;
  serialized_memos: string | null;
} & CoinType;

export type CoinType =
  | { type: 'unknown' }
  | { type: 'reward' }
  | {
      type: 'cat';
      asset_id: string;
      hidden_puzzle_hash: string | null;
      p2_puzzle_hash: string;
    }
  | {
      type: 'singleton';
      launcher_id: string;
      p2_puzzle_hash: string | null;
    }
  | {
      type: 'nft';
      launcher_id: string;
      metadata: string;
      metadata_updater_puzzle_hash: string;
      current_owner: string | null;
      royalty_puzzle_hash: string;
      royalty_basis_points: number;
      p2_puzzle_hash: string;
    }
  | {
      type: 'did';
      launcher_id: string;
      recovery_list_hash: string | null;
      num_verifications_required: number | bigint;
      metadata: string;
      p2_puzzle_hash: string;
    };

export interface Coin {
  parent_coin_info: string;
  puzzle_hash: string;
  amount: number | bigint;
}

export interface BlocksResponse {
  blocks: BlockRecord[];
}

export interface BlockResponse {
  block: BlockRecord | null;
}

export interface CoinsResponse {
  coins: CoinRecord[];
}

export interface CoinResponse {
  coin: CoinRecord | null;
}

export async function getBlocks() {
  const response = await get<BlocksResponse>('/blocks?reverse=true&limit=50');
  return response.blocks;
}

export async function getBlock(hash: string) {
  const response = await get<BlockResponse>(`/blocks/hash/${hash}`);
  return response.block;
}

export async function getBlockByHeight(height: number) {
  const response = await get<BlockResponse>(`/blocks/height/${height}`);
  return response.block;
}

export async function getCoins(headerHash: string) {
  const response = await get<CoinsResponse>(`/coins/block/${headerHash}`);
  return response.coins;
}

export async function getCoin(id: string) {
  const response = await get<CoinResponse>(`/coins/id/${id}`);
  return response.coin;
}
