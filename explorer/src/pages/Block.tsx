import { External } from '@/components/External';
import { Layout } from '@/components/Layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BlockRecord, CoinRecord, getBlock, getCoins } from '@/lib/api';
import { toDecimal } from '@/lib/conversions';
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

      {block?.transaction_info && (
        <div className='space-y-6'>
          <section className='bg-card border rounded-lg p-6'>
            <h2 className='text-xl font-medium mb-4 flex items-center gap-2'>
              <HashIcon className='w-5 h-5' />
              Block Hashes
            </h2>
            <div className='grid gap-3 text-sm'>
              <Field label='Block Hash' value={block.header_hash} />
              <Field label='Previous Block' value={block.prev_block_hash} />
              {block.transaction_info?.prev_transaction_block_hash && (
                <Field
                  label='Previous Transaction Block'
                  value={block.transaction_info.prev_transaction_block_hash}
                />
              )}
              <Field
                label='Farmer Puzzle Hash'
                value={block.farmer_puzzle_hash}
              />
              {block.pool_puzzle_hash && (
                <Field
                  label='Pool Puzzle Hash'
                  value={block.pool_puzzle_hash}
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
              <Field
                label='Transaction Cost'
                value={block.transaction_info.cost.toLocaleString()}
              />
              <Field
                label='Transaction Fees'
                value={`${toDecimal(block.transaction_info.fees, 12)} XCH`}
              />
            </div>
          </section>

          <section>
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

            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {coins.map((coin) => (
                <CoinCard key={coin.coin_id} coinRecord={coin} />
              ))}
            </div>
          </section>
        </div>
      )}

      {!timestamp && (
        <Alert className='mt-4'>
          <LayersIcon />
          <AlertTitle>This is a non-transaction block</AlertTitle>
          <AlertDescription>
            <p>
              This block doesn't contain any reward coins or transactions. You
              can learn more about non-transaction blocks on the{' '}
              <External href='https://docs.chia.net/chia-blockchain/consensus/chains/foliage/'>
                Chia documentation
              </External>
              .
            </p>
          </AlertDescription>
        </Alert>
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
}

function CoinCard({ coinRecord }: CoinCardProps) {
  return (
    <div className='p-4 bg-card border rounded-lg flex flex-col gap-2'>
      <div className='font-mono text-sm'>
        {coinRecord.coin_id.slice(0, 8)}...{coinRecord.coin_id.slice(-8)}
      </div>
      <div className='text-lg font-medium'>
        {toDecimal(coinRecord.coin.amount, coinRecord.type === 'cat' ? 3 : 12)}
      </div>
      <div className='text-sm text-muted-foreground'>{coinRecord.type}</div>
    </div>
  );
}
