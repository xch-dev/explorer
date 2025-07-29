import { External } from '@/components/External';
import { Layout } from '@/components/Layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDexie } from '@/hooks/useDexie';
import { BlockRecord, CoinRecord, getBlock, getCoins } from '@/lib/api';
import { toDecimal, truncateHash } from '@/lib/conversions';
import { intlFormat } from 'date-fns';
import { CoinsIcon, DatabaseIcon, HashIcon, LayersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

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
        <div className='space-y-6'>
          <div className='grid gap-3 lg:grid-cols-2'>
            <section className='bg-card border rounded-lg p-6'>
              <h2 className='text-xl font-medium mb-4 flex items-center gap-2'>
                <HashIcon className='w-5 h-5' />
                Block Hashes
              </h2>
              <div className='grid gap-3 text-sm'>
                <Field
                  label='Block Hash'
                  value={truncateHash(block.header_hash)}
                />
                <Field
                  label='Previous Block'
                  value={truncateHash(block.prev_block_hash)}
                />
                {block.transaction_info?.prev_transaction_block_hash && (
                  <Field
                    label='Previous Transaction Block'
                    value={truncateHash(
                      block.transaction_info.prev_transaction_block_hash,
                    )}
                  />
                )}
                <Field
                  label='Farmer Puzzle Hash'
                  value={truncateHash(block.farmer_puzzle_hash)}
                />
                {block.pool_puzzle_hash && (
                  <Field
                    label='Pool Puzzle Hash'
                    value={truncateHash(block.pool_puzzle_hash)}
                  />
                )}
              </div>
            </section>

            <section className='bg-card border rounded-lg p-6'>
              <h2 className='text-xl font-medium mb-4 flex items-center gap-2'>
                <DatabaseIcon className='w-5 h-5' />
                Block Details
              </h2>
              <div className='grid gap-3 text-sm'>
                <Field
                  label='Total Iterations'
                  value={block.total_iters.toLocaleString()}
                />
                <Field label='Weight' value={block.weight.toLocaleString()} />
                {block.transaction_info && (
                  <>
                    <Field
                      label='Transaction Cost'
                      value={block.transaction_info.cost.toLocaleString()}
                    />
                    <Field
                      label='Transaction Fees'
                      value={`${toDecimal(block.transaction_info.fees, 12)} XCH`}
                    />
                  </>
                )}
              </div>
            </section>
          </div>

          {block?.transaction_info ? (
            <>
              <div className='flex items-center gap-2 mb-4'>
                <CoinsIcon className='w-5 h-5' />
                <h2 className='text-xl font-medium'>Coins</h2>
                <div className='flex items-center gap-1 text-sm ml-2'>
                  <span className='text-green-600'>
                    +{block.transaction_info.additions}
                  </span>
                  <span className='text-red-500'>
                    -{block.transaction_info.removals}
                  </span>
                </div>
              </div>

              <div className='space-y-3 max-h-[600px] pr-2'>
                {coins.map((coin) => (
                  <CoinCard
                    key={coin.coin_id}
                    coinRecord={coin}
                    block={block}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className='flex items-center gap-2 mb-4'>
                <CoinsIcon className='w-5 h-5' />
                <h2 className='text-xl font-medium'>Coins</h2>
              </div>
              <Alert className='mt-3'>
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
            </>
          )}
        </div>
      )}
    </Layout>
  );
}

interface FieldProps {
  label: string;
  value: string | number;
}

function Field({ label, value }: FieldProps) {
  return (
    <div>
      <div className='text-muted-foreground mb-1'>{label}</div>
      <div className='font-mono'>{value}</div>
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
      : coinRecord.type === 'unknown'
        ? tokens['xch']
        : null;

  return (
    <div
      className={`bg-card border rounded-lg hover:bg-accent/50 transition-colors`}
    >
      <div className='p-4'>
        <div className='flex items-center gap-2 mb-3'>
          {token?.icon && (
            <img
              src={token.icon}
              alt={token.name}
              className='w-6 h-6 rounded-full'
            />
          )}
          <div className='font-medium text-lg'>
            {toDecimal(
              coinRecord.coin.amount,
              coinRecord.type === 'cat' ? 3 : 12,
            )}{' '}
            <span className='text-muted-foreground'>
              {token?.code || (coinRecord.type === 'cat' ? 'CAT' : 'XCH')}
            </span>
          </div>
          <div className='flex gap-1.5 ml-auto'>
            {isCreated && (
              <div className='px-2 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-medium'>
                Created
              </div>
            )}
            {isSpent && (
              <div className='px-2 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-medium'>
                Spent
              </div>
            )}
          </div>
        </div>

        <div className='space-y-2 text-sm'>
          <div>
            <div className='text-muted-foreground'>Coin ID</div>
            <div className='font-mono'>{truncateHash(coinRecord.coin_id)}</div>
          </div>
          <div>
            <div className='text-muted-foreground'>Puzzle Hash</div>
            <div className='font-mono'>
              {truncateHash(coinRecord.coin.puzzle_hash)}
            </div>
          </div>
          {coinRecord.type === 'cat' && (
            <div>
              <div className='text-muted-foreground'>Asset ID</div>
              <div className='font-mono'>
                {truncateHash(coinRecord.asset_id)}
              </div>
            </div>
          )}
          <div className='text-muted-foreground text-xs'>
            {isCreated
              ? `Created at height ${coinRecord.created_height.toLocaleString()}`
              : ''}
            {isCreated && isSpent ? ' • ' : ''}
            {isSpent
              ? `Spent at height ${coinRecord.spent_height?.toLocaleString()}`
              : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
