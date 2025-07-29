import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { Textarea } from '@/components/ui/textarea';
import { parseJson } from '@/lib/json';
import {
  ParsedCoin,
  ParsedCoinSpend,
  ParsedSpendBundle,
  parseSpendBundle,
} from '@/lib/parser';
import {
  Coin,
  CoinSpend,
  decodeOffer,
  Signature,
  SpendBundle,
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

  const parsedSpendBundle = useMemo(() => {
    if (!spendBundle) return null;

    return parseSpendBundle(spendBundle);
  }, [spendBundle]);

  return (
    <Layout>
      <Textarea
        placeholder='Enter spend bundle or offer file'
        className='h-30'
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      {parsedSpendBundle && <BundleViewer bundle={parsedSpendBundle} />}
    </Layout>
  );
}

interface BundleViewerProps {
  bundle: ParsedSpendBundle;
}

function BundleViewer({ bundle }: BundleViewerProps) {
  return (
    <div className='flex flex-col gap-2 mt-4'>
      {bundle.coinSpends.map((spend) => (
        <SpendViewer key={spend.coin.coinId} spend={spend} />
      ))}
    </div>
  );
}

interface SpendViewerProps {
  spend: ParsedCoinSpend;
}

function SpendViewer({ spend }: SpendViewerProps) {
  return (
    <div className='flex flex-col gap-2 p-2 rounded-md bg-card'>
      <CoinViewer coin={spend.coin} />
      <div className='flex flex-col p-2 rounded-md bg-accent'>
        <div className='text-sm text-muted-foreground'>Puzzle Reveal</div>
        <Truncated value={spend.puzzleReveal} />
      </div>
      <div className='flex flex-col p-2 rounded-md bg-accent'>
        <div className='text-sm text-muted-foreground'>Solution</div>
        <Truncated value={spend.solution} />
      </div>
    </div>
  );
}

interface CoinViewerProps {
  coin: ParsedCoin;
}

function CoinViewer({ coin }: CoinViewerProps) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-col p-2 rounded-md bg-accent'>
        <div className='text-sm text-muted-foreground'>Coin ID</div>
        <Truncated value={coin.coinId} href={`/coin/${coin.coinId}`} />
      </div>
      <div className='flex flex-col p-2 rounded-md bg-accent'>
        <div className='text-sm text-muted-foreground'>Parent Coin Info</div>
        <Truncated
          value={coin.parentCoinInfo}
          href={`/coin/${coin.parentCoinInfo}`}
        />
      </div>
      <div className='flex flex-col p-2 rounded-md bg-accent'>
        <div className='text-sm text-muted-foreground'>Puzzle Hash</div>
        <Truncated value={coin.puzzleHash} />
      </div>
      <div className='flex flex-col p-2 rounded-md bg-accent'>
        <div className='text-sm text-muted-foreground'>Amount</div>
        <div>{coin.amount}</div>
      </div>
    </div>
  );
}
