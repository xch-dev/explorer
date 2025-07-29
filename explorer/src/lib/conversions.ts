import BigNumber from 'bignumber.js';

import { Address, fromHex } from 'chia-wallet-sdk-wasm';

BigNumber.config({ EXPONENTIAL_AT: [-1e9, 1e9] });

export enum Precision {
  Xch,
  Cat,
  Singleton,
}

export function toDecimal(
  amount: BigNumber.Value,
  precision: Precision,
): string {
  return toBigNumber(amount, precision).toString();
}

export function toBigNumber(
  amount: BigNumber.Value,
  precision: Precision,
): BigNumber {
  let decimals: number;

  switch (precision) {
    case Precision.Xch:
      decimals = 12;
      break;
    case Precision.Cat:
      decimals = 3;
      break;
    case Precision.Singleton:
      decimals = 12;
      break;
  }

  return BigNumber(amount).dividedBy(BigNumber(10).pow(decimals));
}

export function truncateHash(hash: string): string {
  return hash.slice(0, 8) + '...' + hash.slice(-8);
}

export function stripHex(hash: string): string {
  return hash.replace('0x', '');
}

export function toAddress(hash: string, prefix = 'xch'): string {
  return new Address(fromHex(stripHex(hash)), prefix).encode();
}
