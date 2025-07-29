import { Layout } from '@/components/Layout';
import { Textarea } from '@/components/ui/textarea';
import { stripHex } from '@/lib/conversions';
import {
  Coin,
  CoinSpend,
  decodeOffer,
  fromHex,
  Signature,
  SpendBundle,
  toHex,
} from 'chia-wallet-sdk-wasm';
import { useMemo } from 'react';
import { useLocalStorage } from 'usehooks-ts';

export function Tools() {
  const [value, setValue] = useLocalStorage('tools-bundle', '');

  const spendBundle = useMemo(() => {
    if (!value) return null;

    try {
      return decodeOffer(value);
    } catch {
      // Not a valid offer
    }

    try {
      const result = parseJson(JSON.parse(value));

      if (result instanceof SpendBundle) {
        return result;
      } else if (result instanceof CoinSpend) {
        return new SpendBundle([result], Signature.infinity());
      } else if (result instanceof Coin) {
        return null;
      }
    } catch {
      // Not a valid spend bundle
    }

    return null;
  }, [value]);

  return (
    <Layout>
      <Textarea
        placeholder='Enter spend bundle or offer file'
        className='h-30'
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      {spendBundle && <BundleViewer bundle={spendBundle} />}
    </Layout>
  );
}

interface BundleViewerProps {
  bundle: SpendBundle;
}

function BundleViewer({ bundle }: BundleViewerProps) {
  return (
    <div>
      {bundle.coinSpends.map((spend) => (
        <SpendViewer key={toHex(spend.coin.coinId())} spend={spend} />
      ))}
    </div>
  );
}

interface SpendViewerProps {
  spend: CoinSpend;
}

function SpendViewer({ spend }: SpendViewerProps) {
  return (
    <div>
      <CoinViewer coin={spend.coin} />
      <div>
        <div>{toHex(spend.puzzleReveal)}</div>
        <div>{toHex(spend.solution)}</div>
      </div>
    </div>
  );
}

interface CoinViewerProps {
  coin: Coin;
}

function CoinViewer({ coin }: CoinViewerProps) {
  return (
    <div>
      <div>{toHex(coin.coinId())}</div>
      <div>{coin.amount}</div>
      <div>{toHex(coin.puzzleHash)}</div>
      <div>{toHex(coin.parentCoinInfo)}</div>
    </div>
  );
}

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

function parseCoin(json: CoinJson) {
  return new Coin(
    fromHex(stripHex(json.parent_coin_info)),
    fromHex(stripHex(json.puzzle_hash)),
    BigInt(json.amount),
  );
}

function parseCoinSpend(json: CoinSpendJson) {
  return new CoinSpend(
    parseCoin(json.coin),
    fromHex(stripHex(json.puzzle_reveal)),
    fromHex(stripHex(json.solution)),
  );
}

function parseSpendBundle(json: SpendBundleJson) {
  return new SpendBundle(
    json.coin_spends.map(parseCoinSpend),
    Signature.fromBytes(fromHex(stripHex(json.aggregated_signature))),
  );
}

function parseWrappedSpendBundle(json: WrappedSpendBundleJson) {
  return parseSpendBundle(json.spend_bundle);
}

function parseJson(json: unknown) {
  if (typeof json === 'string') {
    return SpendBundle.fromBytes(fromHex(stripHex(json)));
  }

  if (typeof json !== 'object' || json === null) {
    return null;
  }

  if (Array.isArray(json)) {
    return new SpendBundle(json.map(parseCoinSpend), Signature.infinity());
  }

  if ('spend_bundle' in json) {
    return parseWrappedSpendBundle(json as WrappedSpendBundleJson);
  }

  if ('coin_spends' in json) {
    return parseSpendBundle(json as SpendBundleJson);
  }

  if ('coin' in json) {
    return parseCoinSpend(json as CoinSpendJson);
  }

  if ('parent_coin_info' in json) {
    return parseCoin(json as CoinJson);
  }

  return null;
}
