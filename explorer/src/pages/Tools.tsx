import { DropdownSelector } from '@/components/DropdownSelector';
import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { Textarea } from '@/components/ui/textarea';
import { useDexie } from '@/hooks/useDexie';
import { Precision, toDecimal } from '@/lib/conversions';
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
import { CoinsIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  const [selectedSpend, setSelectedSpend] = useState<ParsedCoinSpend | null>(
    bundle.coinSpends[0] ?? null,
  );
  const { tokens } = useDexie();

  const totalCost = useMemo(() => {
    return bundle.coinSpends.reduce((acc, spend) => {
      const cost = typeof spend.cost === 'number' ? spend.cost : 0;
      return acc + cost;
    }, 0);
  }, [bundle.coinSpends]);

  return (
    <div className='flex flex-col gap-4 mt-4'>
      <div className='p-4 rounded-md bg-card'>
        <div className='text-lg font-medium mb-2'>Bundle Information</div>
        <div className='grid grid-cols-2 gap-4 text-sm'>
          <div>
            <div className='text-muted-foreground'>Total Cost</div>
            <div>{totalCost}</div>
          </div>
          <div>
            <div className='text-muted-foreground'>Total Spends</div>
            <div>{bundle.coinSpends.length}</div>
          </div>
          <div className='col-span-2'>
            <div className='text-muted-foreground'>Bundle Hash</div>
            <div className='truncate'>0x1234567890abcdef</div>
          </div>
        </div>
      </div>

      <div className='flex flex-col'>
        <div className='flex items-center gap-2'>
          <DropdownSelector
            loadedItems={bundle.coinSpends}
            onSelect={setSelectedSpend}
            renderItem={(spend) => (
              <div className='flex items-center gap-2 w-full'>
                {tokens?.xch?.icon ? (
                  <img
                    src={tokens.xch.icon}
                    alt='XCH'
                    className='w-6 h-6 rounded-full flex-shrink-0'
                  />
                ) : (
                  <div className='w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
                    <CoinsIcon className='w-3.5 h-3.5 text-primary' />
                  </div>
                )}
                <div className='flex flex-col min-w-0'>
                  <div className='font-medium flex flex-wrap items-center gap-1.5'>
                    <span className='break-all'>
                      {toDecimal(spend.coin.amount, Precision.Xch)}
                    </span>
                    <span className='text-muted-foreground font-normal'>
                      XCH
                    </span>
                  </div>
                  <div className='font-mono text-xs text-muted-foreground truncate'>
                    <Truncated value={spend.coin.coinId} disableCopy />
                  </div>
                </div>
              </div>
            )}
            width='w-[350px]'
            className='rounded-b-none'
          >
            {selectedSpend ? (
              <div className='flex items-center gap-2 min-w-0'>
                {tokens?.xch?.icon ? (
                  <img
                    src={tokens.xch.icon}
                    alt='XCH'
                    className='w-6 h-6 rounded-full flex-shrink-0'
                  />
                ) : (
                  <div className='w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
                    <CoinsIcon className='w-3.5 h-3.5 text-primary' />
                  </div>
                )}
                <div className='flex flex-col min-w-0'>
                  <div className='font-medium flex flex-wrap items-center gap-1.5'>
                    <span className='break-all'>
                      {toDecimal(selectedSpend.coin.amount, Precision.Xch)}
                    </span>
                    <span className='text-muted-foreground font-normal'>
                      XCH
                    </span>
                  </div>
                  <div className='font-mono text-xs text-muted-foreground truncate'>
                    <Truncated value={selectedSpend.coin.coinId} disableCopy />
                  </div>
                </div>
              </div>
            ) : (
              <div className='text-muted-foreground'>
                Select a spend to view
              </div>
            )}
          </DropdownSelector>
        </div>

        {selectedSpend && <SpendViewer spend={selectedSpend} />}
      </div>
    </div>
  );
}

interface SpendViewerProps {
  spend: ParsedCoinSpend;
}

function SpendViewer({ spend }: SpendViewerProps) {
  return (
    <div className='flex flex-col gap-3 p-3 rounded-t-none rounded-md bg-card border border-t-0 border-input'>
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
            <div className='text-muted-foreground'>Cost</div>
            <div>{spend.cost}</div>
          </div>
        </div>
      </div>

      {spend.conditions.length > 0 && (
        <div className='flex flex-col gap-2'>
          <div className='text-sm text-muted-foreground'>Output Conditions</div>
          {spend.conditions.map((condition, index) => (
            // eslint-disable-next-line react/no-array-index-key -- immutable
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
