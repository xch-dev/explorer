import { External } from '@/components/External';
import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDexie } from '@/hooks/useDexie';
import { BlockRecord, CoinRecord, getBlock, getCoins } from '@/lib/api';
import { toAddress, toDecimal } from '@/lib/conversions';
import { intlFormat } from 'date-fns';
import { CoinsIcon, DatabaseIcon, HashIcon, LayersIcon } from 'lucide-react';
import { PropsWithChildren, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

export function Block() {
  const { hash } = useParams();

  const [block, setBlock] = useState<BlockRecord | null>(null);
  const [coins, setCoins] = useState<CoinRecord[]>([]);

  useEffect(() => {
    if (!hash) return;

    getBlock(hash).then(setBlock);
    getCoins(hash).then(setCoins);
  }, [hash]);

  const timestamp = block?.transaction_info
    ? new Date(block.transaction_info.timestamp * 1000)
    : null;

  return (
    <Layout>
      <div className='flex items-baseline gap-3 mb-2'>
        <h1 className='text-3xl font-semibold'>
          Block {block?.height.toLocaleString() ?? 'loading...'}
        </h1>
        {timestamp && (
          <div className='text-lg text-muted-foreground'>
            {intlFormat(timestamp, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </div>
        )}
      </div>

      {block && (
        <div className='mt-4'>
          <div className='grid gap-4 lg:grid-cols-2'>
            <section className='bg-card border rounded-lg p-6'>
              <h2 className='text-xl font-medium mb-4 flex items-center gap-2'>
                <HashIcon className='w-5 h-5' />
                Block Hashes
              </h2>
              <div className='grid gap-3 text-sm'>
                <Field label='Block Hash'>
                  <Truncated
                    value={block.header_hash}
                    href={`/block/${block.header_hash}`}
                  />
                </Field>
                <Field label='Previous Block'>
                  <Truncated
                    value={block.prev_block_hash}
                    href={`/block/${block.prev_block_hash}`}
                  />
                </Field>
                {block.transaction_info?.prev_transaction_block_hash && (
                  <Field label='Previous Transaction Block'>
                    <Truncated
                      value={block.transaction_info.prev_transaction_block_hash}
                      href={`/block/${block.transaction_info.prev_transaction_block_hash}`}
                    />
                  </Field>
                )}
                <Field label='Farmer Address'>
                  <Truncated value={toAddress(block.farmer_puzzle_hash)} />
                </Field>
                {block.pool_puzzle_hash && (
                  <Field label='Pool Address'>
                    <Truncated value={toAddress(block.pool_puzzle_hash)} />
                  </Field>
                )}
              </div>
            </section>

            <section className='bg-card border rounded-lg p-6'>
              <h2 className='text-xl font-medium mb-4 flex items-center gap-2'>
                <DatabaseIcon className='w-5 h-5' />
                Block Details
              </h2>
              <div className='grid gap-3 text-sm'>
                <Field label='Total Iterations'>
                  {block.total_iters.toLocaleString()}
                </Field>
                <Field label='Weight'>{block.weight.toLocaleString()}</Field>
                {block.transaction_info && (
                  <>
                    <Field label='Transaction Cost'>
                      {block.transaction_info.cost.toLocaleString()}
                    </Field>
                    <Field label='Transaction Fees'>
                      {`${toDecimal(block.transaction_info.fees, 12)} XCH`}
                    </Field>
                  </>
                )}
              </div>
            </section>
          </div>

          {block?.transaction_info ? (
            <>
              <div className='grid md:grid-cols-2 gap-4 mt-6'>
                <div>
                  <div className='flex items-center gap-2 mb-4'>
                    <CoinsIcon className='w-5 h-5' />
                    <h2 className='text-xl font-medium'>Spent</h2>
                    <div className='text-sm text-red-600'>
                      -{block.transaction_info.removals}
                    </div>
                  </div>
                  <div className='space-y-2'>
                    {coins
                      .filter((coin) => coin.spent_height === block.height)
                      .map((coin) => (
                        <CoinCard
                          key={`spent-${coin.coin_id}`}
                          coinRecord={coin}
                          block={block}
                        />
                      ))}
                  </div>
                </div>

                <div>
                  <div className='flex items-center gap-2 mb-4'>
                    <CoinsIcon className='w-5 h-5' />
                    <h2 className='text-xl font-medium'>Created</h2>
                    <div className='text-sm text-green-600'>
                      +{block.transaction_info.additions}
                    </div>
                  </div>
                  <div className='space-y-2'>
                    {coins
                      .filter((coin) => coin.created_height === block.height)
                      .map((coin) => (
                        <CoinCard
                          key={`created-${coin.coin_id}`}
                          coinRecord={coin}
                          block={block}
                        />
                      ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <Alert className='mt-4'>
              <LayersIcon />
              <AlertTitle>This is a non-transaction block</AlertTitle>
              <AlertDescription>
                <p>
                  This block doesn't contain any reward coins or transactions.
                  You can learn more about non-transaction blocks on the{' '}
                  <External href='https://docs.chia.net/chia-blockchain/consensus/chains/foliage/'>
                    Chia documentation
                  </External>
                  .
                </p>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </Layout>
  );
}

interface FieldProps extends PropsWithChildren {
  label: string;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <div className='text-muted-foreground'>{label}</div>
      <div className='font-mono'>{children}</div>
    </div>
  );
}

interface CoinCardProps {
  coinRecord: CoinRecord;
  block: BlockRecord | null;
}

function CoinCard({ coinRecord, block }: CoinCardProps) {
  const { tokens } = useDexie();
  const isCreated = coinRecord.created_height === block?.height;
  const isSpent = coinRecord.spent_height === block?.height;

  const token =
    coinRecord.type === 'cat'
      ? tokens[coinRecord.asset_id.replace('0x', '')]
      : coinRecord.type === 'unknown' || coinRecord.type === 'reward'
        ? tokens['xch']
        : null;

  return (
    <Link
      to={`/coin/${coinRecord.coin_id}`}
      className='block bg-card border rounded-lg hover:bg-accent/75 transition-colors overflow-hidden'
    >
      <div className='p-1.5'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex items-center gap-2 min-w-0 flex-1'>
            {token?.icon ? (
              <img
                src={token.icon}
                alt={token.name}
                className='w-6 h-6 rounded-full flex-shrink-0'
              />
            ) : (
              <div className='w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
                <CoinsIcon className='w-3.5 h-3.5 text-primary' />
              </div>
            )}
            <div className='min-w-0'>
              <div className='font-medium flex flex-wrap items-center gap-1.5'>
                <span className='break-all'>
                  {toDecimal(
                    coinRecord.coin.amount,
                    coinRecord.type === 'cat' ? 3 : 12,
                  )}
                </span>{' '}
                <span className='text-muted-foreground font-normal'>
                  {token?.code ||
                    (coinRecord.type === 'cat'
                      ? 'CAT'
                      : coinRecord.type === 'unknown' ||
                          coinRecord.type === 'reward'
                        ? 'XCH'
                        : '')}
                </span>
              </div>
              <div className='font-mono text-xs text-muted-foreground truncate'>
                <Truncated value={coinRecord.coin_id} disableCopy />
              </div>
            </div>
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {isCreated && isSpent ? (
              <div className='px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-full text-xs font-medium flex items-center gap-1 whitespace-nowrap'>
                Ephemeral
              </div>
            ) : (
              <>
                {isCreated && (
                  <div className='px-1.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full text-xs font-medium flex items-center gap-1 whitespace-nowrap'>
                    Created
                  </div>
                )}
                {isSpent && (
                  <div className='px-1.5 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full text-xs font-medium flex items-center gap-1 whitespace-nowrap'>
                    Spent
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
