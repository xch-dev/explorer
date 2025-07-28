const API_URL: string = import.meta.env.VITE_API_URL;

function apiUrl(path: string) {
  return new URL(path, API_URL).href;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  return response.json();
}

export interface Block {
  height: number;
  header_hash: string;
  weight: number;
  total_iters: number;
  farmer_puzzle_hash: string;
  pool_puzzle_hash: string | null;
  prev_block_hash: string;
  transaction_info: TransactionInfo | null;
}

export interface TransactionInfo {
  timestamp: number;
  fees: number;
  cost: number;
  additions: number;
  removals: number;
  prev_transaction_block_hash: string;
}

export interface BlocksResponse {
  blocks: Block[];
}

export async function getBlocks() {
  const response = await get<BlocksResponse>('/blocks?reverse=true');
  return response.blocks;
}
