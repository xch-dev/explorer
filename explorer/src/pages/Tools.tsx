import { DropdownSelector } from '@/components/DropdownSelector';
import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { Textarea } from '@/components/ui/textarea';
import { useDexie } from '@/hooks/useDexie';
import { Precision, toDecimal } from '@/lib/conversions';
import { parseJson } from '@/lib/json';
import {
  ConditionType,
  ParsedCoinSpend,
  ParsedCondition,
  ParsedLayer,
  ParsedSpendBundle,
  parseSpendBundle,
} from '@/lib/parser';
import { ArgType } from '@/lib/parser/arg';
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

  return (
    <div className='flex flex-col gap-4 mt-4'>
      <div className='p-4 rounded-md bg-card border border-input'>
        <div className='text-lg font-medium mb-2'>Spend Bundle</div>
        <div className='flex flex-col gap-1 text-sm'>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Cost</div>
            <div>{bundle.totalCost}</div>
          </div>

          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Spends</div>
            <div>{bundle.coinSpends.length}</div>
          </div>

          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Bundle Hash</div>
            <Truncated value={bundle.hash} />
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
        <div className='flex flex-col gap-1 p-2 rounded-md text-sm border border-input/30 bg-accent/40'>
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

        <div className='flex flex-col gap-1 p-2 rounded-md text-sm border border-input/30 bg-accent/40'>
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

      <div className='flex flex-col gap-2'>
        <div className='text-sm text-muted-foreground'>Puzzle Layers</div>
        <LayerViewer layer={spend.layer} />
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

interface LayerViewerProps {
  layer: ParsedLayer;
  depth?: number;
  label?: string;
}

function LayerViewer({ layer, depth = 0, label }: LayerViewerProps) {
  const getBorderColor = () => {
    return 'border-l-orange-500';
  };

  return (
    <div style={{ marginLeft: `${depth > 0 ? 0.5 : 0}rem` }}>
      {label && (
        <div className='break-all text-xs text-muted-foreground mb-1'>
          {label}:
        </div>
      )}

      <div
        className={`p-1.5 rounded-md text-sm border-l-4 ${getBorderColor()} bg-accent`}
      >
        <div className='flex flex-col gap-1 mb-1'>
          <div className='font-medium break-all'>{layer.name}</div>
        </div>
        <div className='space-y-1 text-xs'>
          {Object.entries(layer.args).map(([key, value]) => (
            <div
              key={key}
              className='flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2'
            >
              <div className='text-muted-foreground sm:min-w-24'>{key}:</div>
              <div className='flex-1 break-all'>
                {(value.type === ArgType.Copiable ||
                  value.type === ArgType.CoinId) &&
                value.value ? (
                  <Truncated
                    value={value.value}
                    href={
                      value.type === ArgType.CoinId
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
      {Object.keys(layer.children).length > 0 && (
        <div className='mt-1'>
          <div className='space-y-2'>
            {Object.entries(layer.children).map(([key, child]) => (
              <div key={key}>
                <LayerViewer layer={child} depth={depth + 1} label={key} />
              </div>
            ))}
          </div>
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
        <div className='text-sm text-yellow-600 dark:text-yellow-500 mb-1 flex items-center gap-1'>
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
              {value.type === ArgType.Copiable ||
              value.type === ArgType.CoinId ? (
                <Truncated
                  value={value.value}
                  href={
                    value.type === ArgType.CoinId
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
