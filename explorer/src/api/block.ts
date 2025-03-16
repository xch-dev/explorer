export interface Block {
  height: number;
  header_hash: string;
  transaction_info?: {
    timestamp: number;
    fees: number;
    cost: number;
    additions: number;
    removals: number;
  };
}
