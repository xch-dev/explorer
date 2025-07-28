import BigNumber from 'bignumber.js';

BigNumber.config({ EXPONENTIAL_AT: [-1e9, 1e9] });

export function toDecimal(amount: BigNumber.Value, decimals: number): string {
  return toBigNumber(amount, decimals).toString();
}

export function toBigNumber(
  amount: BigNumber.Value,
  decimals: number,
): BigNumber {
  return BigNumber(amount).dividedBy(BigNumber(10).pow(decimals));
}

export function truncateHash(hash: string): string {
  return hash.slice(0, 8) + '...' + hash.slice(-8);
}
