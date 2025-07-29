import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { Textarea } from '@/components/ui/textarea';
import { parseJson } from '@/lib/json';
import {
  ConditionArgType,
  ConditionType,
  ParsedCoinSpend,
  ParsedCondition,
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
import { TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useLocalStorage } from 'usehooks-ts';

export function Tools() {
  const [value, setValue] = useLocalStorage('tools-bundle', '');

  const parsedSpendBundle = useMemo(() => {
    if (!value) return null;

    try {
      return parseSpendBundle(decodeOffer(value), true);
    } catch {
      // Not a valid offer
    }

    try {
      const result = parseJson(JSON.parse(value));

      if (result instanceof SpendBundle) {
        return parseSpendBundle(result, true);
      } else if (result instanceof CoinSpend) {
        return parseSpendBundle(
          new SpendBundle([result], Signature.infinity()),
          false,
        );
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
    <div className='flex flex-col gap-3 p-3 rounded-md bg-card'>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        <div className='flex flex-col gap-1 p-2 rounded-md bg-accent text-sm'>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Coin ID</div>
            <Truncated
              value={spend.coin.coinId}
              href={`/coin/${spend.coin.coinId}`}
            />
          </div>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Parent ID</div>
            <Truncated
              value={spend.coin.parentCoinInfo}
              href={`/coin/${spend.coin.parentCoinInfo}`}
            />
          </div>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Puzzle Hash</div>
            <Truncated value={spend.coin.puzzleHash} />
          </div>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Amount</div>
            <div>{spend.coin.amount}</div>
          </div>
        </div>

        <div className='flex flex-col gap-1 p-2 rounded-md bg-accent text-sm'>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Puzzle Reveal</div>
            <Truncated value={spend.puzzleReveal} />
          </div>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Solution</div>
            <Truncated value={spend.solution} />
          </div>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Runtime Cost</div>
            <div>{spend.runtimeCost}</div>
          </div>
        </div>
      </div>

      {spend.conditions.length > 0 && (
        <div className='flex flex-col gap-2'>
          <div className='text-sm text-muted-foreground'>Output Conditions</div>
          {spend.conditions.map((condition, index) => (
            <ConditionViewer key={index} condition={condition} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ConditionViewerProps {
  condition: ParsedCondition;
}

function ConditionViewer({ condition }: ConditionViewerProps) {
  const getBorderColor = () => {
    switch (condition.type) {
      case ConditionType.Output:
        return 'border-l-emerald-500';
      case ConditionType.Assertion:
        return 'border-l-blue-500';
      case ConditionType.Timelock:
        return 'border-l-indigo-500';
      case ConditionType.Announcement:
        return 'border-l-purple-500';
      case ConditionType.Message:
        return 'border-l-rose-500';
      case ConditionType.AggSig:
        return 'border-l-cyan-500';
      default:
        return 'border-l-gray-500';
    }
  };

  return (
    <div
      className={`p-1.5 rounded-md text-sm border-l-4 ${getBorderColor()} bg-accent`}
    >
      <div className='flex flex-wrap items-center gap-2 mb-1'>
        <div className='font-medium'>{condition.name}</div>
        <div className='text-xs text-muted-foreground'>
          ({condition.opcode})
        </div>
      </div>
      {condition.warning !== null && (
        <div className='text-sm text-yellow-500 mb-1 flex items-center gap-1'>
          <TriangleAlertIcon className='w-4 h-4' /> {condition.warning}
        </div>
      )}
      <div className='space-y-1 text-xs'>
        {Object.entries(condition.args).map(([key, value]) => (
          <div
            key={key}
            className='flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2'
          >
            <div className='text-muted-foreground sm:min-w-24'>{key}:</div>
            <div className='flex-1 break-all'>
              {value.type === ConditionArgType.Copiable ||
              value.type === ConditionArgType.CoinId ? (
                <Truncated
                  value={value.value}
                  href={
                    value.type === ConditionArgType.CoinId
                      ? `/coin/${value.value}`
                      : undefined
                  }
                />
              ) : (
                <div>{value.value}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
