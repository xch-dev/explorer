import { ColoredLink } from '@/components/ColoredLink';
import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { useDexie } from '@/hooks/useDexie';
import { BlockRecord, CoinRecord, getBlockByHeight, getCoin } from '@/lib/api';
import { toDecimal } from '@/lib/conversions';
import { intlFormat } from 'date-fns';
import { CoinsIcon, HashIcon, LayersIcon } from 'lucide-react';
import { PropsWithChildren, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function Coin() {
  const { id } = useParams();
  const { tokens } = useDexie();

  const [coin, setCoin] = useState<CoinRecord | null>(null);
  const [createdBlock, setCreatedBlock] = useState<BlockRecord | null>(null);
  const [spentBlock, setSpentBlock] = useState<BlockRecord | null>(null);

  useEffect(() => {
    if (!id) return;
    getCoin(id).then(setCoin);
  }, [id]);

  useEffect(() => {
    if (!coin) return;
    getBlockByHeight(coin.created_height).then(setCreatedBlock);

    if (coin.spent_height) {
      getBlockByHeight(coin.spent_height).then(setSpentBlock);
    }
  }, [coin]);

  const token = coin
    ? coin.type === 'cat'
      ? tokens[coin.asset_id.replace('0x', '')]
      : coin.type === 'unknown' || coin.type === 'reward'
        ? tokens['xch']
        : null
    : null;

  return (
    <Layout>
      <div className='flex items-baseline gap-3 mb-2'>
        <h1 className='text-3xl font-semibold'>Coin Details</h1>
      </div>

      {coin && (
        <div className='mt-4'>
          <div className='grid gap-4 lg:grid-cols-2'>
            <section className='bg-card border rounded-lg p-6'>
              <h2 className='text-xl font-medium mb-4 flex items-center gap-2'>
                <HashIcon className='w-5 h-5' />
                Information
              </h2>
              <div className='grid gap-3 text-sm'>
                <Field label='Coin ID' mono>
                  <Truncated
                    value={coin.coin_id}
                    href={`/coin/${coin.coin_id}`}
                  />
                </Field>
                <Field label='Parent Coin' mono>
                  <Truncated
                    value={coin.coin.parent_coin_info}
                    href={`/coin/${coin.coin.parent_coin_info}`}
                  />
                </Field>
                <Field label='Puzzle Hash' mono>
                  <Truncated value={coin.coin.puzzle_hash} />
                </Field>
                {coin.hint && (
                  <Field label='Hint' mono>
                    <Truncated value={coin.hint} />
                  </Field>
                )}
              </div>
            </section>

            <section className='bg-card border rounded-lg p-6'>
              <h2 className='text-xl font-medium mb-4 flex items-center gap-2'>
                <LayersIcon className='w-5 h-5' />
                Asset
              </h2>
              <div className='grid gap-3 text-sm'>
                {(coin.type === 'reward' || coin.type === 'cat') && (
                  <div className='flex items-center gap-2'>
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
                    <div className='font-medium'>
                      {token?.name || 'Unnamed'}
                    </div>
                  </div>
                )}

                <Field label='Asset Type'>
                  {coin.type === 'unknown'
                    ? 'Unknown'
                    : coin.type === 'reward'
                      ? 'Reward'
                      : coin.type === 'cat'
                        ? 'CAT2'
                        : coin.type === 'singleton'
                          ? 'Singleton'
                          : coin.type === 'nft'
                            ? 'NFT1'
                            : 'DID1'}
                </Field>
                <Field label='Amount'>
                  <div className='font-medium flex flex-wrap items-center gap-1.5'>
                    <span>
                      {toDecimal(
                        coin.coin.amount,
                        coin.type === 'cat' ? 3 : 12,
                      )}
                    </span>{' '}
                    <span className='text-muted-foreground font-normal'>
                      {token?.code ||
                        (coin.type === 'cat'
                          ? 'CAT'
                          : coin.type === 'unknown' || coin.type === 'reward'
                            ? 'XCH'
                            : '')}
                    </span>
                  </div>
                </Field>
                {coin.type === 'cat' && (
                  <Field label='Asset ID'>
                    <Truncated value={coin.asset_id} />
                  </Field>
                )}
                <Field label='Created Height'>
                  <ColoredLink href={`/block/${createdBlock?.header_hash}`}>
                    {coin.created_height.toLocaleString()}
                  </ColoredLink>
                  {createdBlock?.transaction_info &&
                    ` - ${intlFormat(
                      createdBlock.transaction_info.timestamp * 1000,
                      {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      },
                    )}`}
                </Field>
                <Field label='Spent Height'>
                  {coin.spent_height ? (
                    <>
                      <ColoredLink href={`/block/${spentBlock?.header_hash}`}>
                        {coin.spent_height.toLocaleString()}
                      </ColoredLink>
                      {spentBlock?.transaction_info &&
                        ` - ${intlFormat(
                          spentBlock.transaction_info.timestamp * 1000,
                          {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          },
                        )}`}
                    </>
                  ) : (
                    'None'
                  )}
                </Field>
              </div>
            </section>
          </div>
        </div>
      )}
    </Layout>
  );
}

interface FieldProps extends PropsWithChildren {
  label: string;
  mono?: boolean;
}

function Field({ label, children, mono = false }: FieldProps) {
  return (
    <div>
      <div className='text-muted-foreground'>{label}</div>
      <div className={mono ? 'font-mono' : ''}>{children}</div>
    </div>
  );
}
