import {
  Coin,
  CoinSpend,
  fromHex,
  Signature,
  SpendBundle,
} from 'chia-wallet-sdk-wasm';
import jsonParser from 'json-bigint';
import { stripHex } from './conversions';

export const { parse, stringify } = jsonParser({
  useNativeBigInt: true,
});

interface CoinJson {
  parent_coin_info: string;
  puzzle_hash: string;
  amount: number;
}

interface CoinSpendJson {
  coin: CoinJson;
  puzzle_reveal: string;
  solution: string;
}

interface SpendBundleJson {
  coin_spends: CoinSpendJson[];
  aggregated_signature: string;
}

interface WrappedSpendBundleJson {
  spend_bundle: SpendBundleJson;
}

function parseCoinJson(json: CoinJson) {
  return new Coin(
    fromHex(stripHex(json.parent_coin_info)),
    fromHex(stripHex(json.puzzle_hash)),
    BigInt(json.amount),
  );
}

function parseCoinSpendJson(json: CoinSpendJson) {
  return new CoinSpend(
    parseCoinJson(json.coin),
    fromHex(stripHex(json.puzzle_reveal)),
    fromHex(stripHex(json.solution)),
  );
}

function parseSpendBundleJson(json: SpendBundleJson) {
  return new SpendBundle(
    json.coin_spends.map(parseCoinSpendJson),
    Signature.fromBytes(fromHex(stripHex(json.aggregated_signature))),
  );
}

function parseWrappedSpendBundleJson(json: WrappedSpendBundleJson) {
  return parseSpendBundleJson(json.spend_bundle);
}

export function parseJson(json: unknown) {
  if (typeof json === 'string') {
    return SpendBundle.fromBytes(fromHex(stripHex(json)));
  }

  if (typeof json !== 'object' || json === null) {
    return null;
  }

  if (Array.isArray(json)) {
    return new SpendBundle(json.map(parseCoinSpendJson), Signature.infinity());
  }

  if ('spend_bundle' in json) {
    return parseWrappedSpendBundleJson(json as WrappedSpendBundleJson);
  }

  if ('coin_spends' in json) {
    return parseSpendBundleJson(json as SpendBundleJson);
  }

  if ('coin' in json) {
    return parseCoinSpendJson(json as CoinSpendJson);
  }

  if ('parent_coin_info' in json) {
    return parseCoinJson(json as CoinJson);
  }

  return null;
}
