import {
  ConditionType,
  ParsedCoinSpend,
  ParsedCondition,
  ParsedLayer,
} from '@/lib/parser';
import { ArgType } from '@/lib/parser/arg';
import { cn } from '@/lib/utils';
import { TriangleAlertIcon } from 'lucide-react';
import { Truncated } from './Truncated';

export interface SpendViewerProps {
  spend: ParsedCoinSpend;
  className?: string;
}

export function SpendViewer({ spend, className }: SpendViewerProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-3 rounded-md bg-card border border-input',
        className,
      )}
    >
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
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Asset ID</div>
            <Truncated value={spend.coin.assetId} />
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
