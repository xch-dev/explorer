export interface Coin {
  coin_id: string;
  parent_coin_id: string;
  puzzle_hash: string;
  amount: number;
  hint: string | null;
  memos: string | null;
  type: "reward" | "unknown" | "cat" | "singleton";
  created_height: number;
  spent_height: number | null;
}

export interface Block {
  height: number;
  header_hash: string;
  prev_block_hash: string;
  farmer_puzzle_hash: string;
  pool_puzzle_hash: string | null;
  transaction_info?: {
    timestamp: number;
    fees: number;
    cost: number;
    additions: number;
    removals: number;
    prev_transaction_block_hash: string;
  };
}

export interface StateResponse {
  peak_height: number;
}

export interface BlockResponse {
  block: Block;
}

export interface BlocksResponse {
  blocks: Block[];
}

export interface CoinResponse {
  coin: Coin;
}

export interface CoinsResponse {
  coins: Coin[];
}
