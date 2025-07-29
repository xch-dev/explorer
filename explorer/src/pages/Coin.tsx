import { ColoredLink } from '@/components/ColoredLink';
import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { Nft } from '@/contexts/MintGardenContext';
import { useDexie } from '@/hooks/useDexie';
import { useMintGarden } from '@/hooks/useMintGarden';
import { BlockRecord, CoinRecord, getBlockByHeight, getCoin } from '@/lib/api';
import { Precision, toAddress, toDecimal } from '@/lib/conversions';
import { intlFormat } from 'date-fns';
import {
  ArrowUpCircleIcon,
  CircleDotIcon,
  ClockIcon,
  CoinsIcon,
  HashIcon,
  LayersIcon,
} from 'lucide-react';
import { PropsWithChildren, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function Coin() {
  const { id } = useParams();
  const { tokens } = useDexie();
  const { fetchNft } = useMintGarden();

  const [coin, setCoin] = useState<CoinRecord | null>(null);
  const [createdBlock, setCreatedBlock] = useState<BlockRecord | null>(null);
  const [spentBlock, setSpentBlock] = useState<BlockRecord | null>(null);
  const [nft, setNft] = useState<Nft | null>(null);

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

    if (coin.type === 'nft') {
      fetchNft(coin.launcher_id).then(setNft);
    }
  }, [coin, fetchNft]);

  const token = coin
    ? coin.type === 'cat'
      ? tokens[coin.asset_id.replace('0x', '')]
      : coin.type === 'reward'
        ? tokens['xch']
        : null
    : null;

  const icon = token?.icon ?? nft?.data?.thumbnail_uri;
  const name = token?.name ?? nft?.data?.metadata_json?.name;
  const assetId =
    coin?.type === 'cat'
      ? coin.asset_id
      : coin?.type === 'singleton'
        ? coin.launcher_id
        : coin?.type === 'nft'
          ? toAddress(coin.launcher_id, 'nft')
          : coin?.type === 'did'
            ? toAddress(coin.launcher_id, 'did:chia:')
            : null;

  return (
    <Layout>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
          <div className='flex items-center gap-3'>
            {coin !== null && (token || nft) ? (
              <>
                {icon ? (
                  <img
                    src={icon}
                    alt={name}
                    className='w-12 h-12 rounded-full flex-shrink-0'
                  />
                ) : (
                  <div className='w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
                    <CoinsIcon className='w-7 h-7 text-primary' />
                  </div>
                )}
                <div className='min-w-0'>
                  <h1 className='text-2xl sm:text-3xl font-semibold truncate'>
                    {name || 'Unnamed'}
                  </h1>
                  <div className='flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-muted-foreground'>
                    {assetId && (
                      <div className='font-mono text-sm'>
                        <Truncated value={assetId} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className='w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center'>
                  <CoinsIcon className='w-7 h-7 text-primary' />
                </div>
                <div>
                  <h1 className='text-2xl sm:text-3xl font-semibold'>
                    Coin Details
                  </h1>
                  <p className='text-muted-foreground'>
                    Detailed information about this coin
                  </p>
                </div>
              </>
            )}
          </div>
          {coin && (
            <div className='flex items-center gap-2 px-4 py-2 rounded-full bg-card border self-start sm:self-center'>
              {coin.spent_height ? (
                <>
                  <ArrowUpCircleIcon className='w-5 h-5 text-blue-500' />
                  <span className='font-medium'>Spent</span>
                </>
              ) : (
                <>
                  <CircleDotIcon className='w-5 h-5 text-green-500' />
                  <span className='font-medium'>Unspent</span>
                </>
              )}
            </div>
          )}
        </div>

        {coin && (
          <div className='grid gap-4 mt-2'>
            <div className='grid gap-4 lg:grid-cols-2'>
              <section className='bg-card border rounded-xl p-6 shadow-sm'>
                <h2 className='text-xl font-medium mb-6 flex items-center gap-2 pb-4 border-b'>
                  <HashIcon className='w-5 h-5 text-primary' />
                  Information
                </h2>
                <div className='grid gap-4 text-sm'>
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

              <section className='bg-card border rounded-xl p-6 shadow-sm'>
                <h2 className='text-xl font-medium mb-6 flex items-center gap-2 pb-4 border-b'>
                  <LayersIcon className='w-5 h-5 text-primary' />
                  Asset Details
                </h2>
                <div className='grid gap-4 text-sm'>
                  <Field label='Asset Type'>
                    <span className='px-2 py-1 rounded-md bg-primary/10 text-primary font-medium'>
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
                    </span>
                  </Field>
                  <Field label='Amount'>
                    <div className='font-medium flex flex-wrap items-center gap-1.5 text-base'>
                      <span className='text-lg'>
                        {toDecimal(
                          coin.coin.amount,
                          coin.type === 'cat'
                            ? Precision.Cat
                            : coin.type === 'unknown' || coin.type === 'reward'
                              ? Precision.Xch
                              : Precision.Singleton,
                        )}
                      </span>{' '}
                      <span className='text-muted-foreground'>
                        {token?.code ||
                          (coin.type === 'cat'
                            ? 'CAT'
                            : coin.type === 'unknown' || coin.type === 'reward'
                              ? 'XCH'
                              : '')}
                      </span>
                    </div>
                  </Field>
                </div>
              </section>
            </div>

            <section className='bg-card border rounded-xl p-6 shadow-sm'>
              <h2 className='text-xl font-medium mb-6 flex items-center gap-2 pb-4 border-b'>
                <ClockIcon className='w-5 h-5 text-primary' />
                Timeline
              </h2>
              <div className='grid gap-6 text-sm'>
                <div className='flex items-start gap-4'>
                  <div className='w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0'>
                    <CircleDotIcon className='w-5 h-5 text-green-500' />
                  </div>
                  <div>
                    <div className='font-medium mb-1'>Created at Height</div>
                    <div className='flex items-center gap-2'>
                      <ColoredLink href={`/block/${createdBlock?.header_hash}`}>
                        {coin.created_height.toLocaleString()}
                      </ColoredLink>
                      {createdBlock?.transaction_info && (
                        <span className='text-muted-foreground'>
                          {intlFormat(
                            createdBlock.transaction_info.timestamp * 1000,
                            {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            },
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className='flex items-start gap-4'>
                  {coin.spent_height ? (
                    <>
                      <div className='w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0'>
                        <ArrowUpCircleIcon className='w-5 h-5 text-blue-500' />
                      </div>
                      <div>
                        <div className='font-medium mb-1'>Spent at Height</div>
                        <div className='flex items-center gap-2'>
                          <ColoredLink
                            href={`/block/${spentBlock?.header_hash}`}
                          >
                            {coin.spent_height.toLocaleString()}
                          </ColoredLink>
                          {spentBlock?.transaction_info && (
                            <span className='text-muted-foreground'>
                              {intlFormat(
                                spentBlock.transaction_info.timestamp * 1000,
                                {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                },
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className='w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0'>
                        <ClockIcon className='w-5 h-5 text-yellow-500' />
                      </div>
                      <div>
                        <div className='font-medium mb-1'>Spent Status</div>
                        <div className='text-base'>Not yet spent</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}

interface FieldProps extends PropsWithChildren {
  label: string;
  mono?: boolean;
}

function Field({ label, children, mono = false }: FieldProps) {
  return (
    <div className='space-y-1.5'>
      <div className='text-muted-foreground font-medium'>{label}</div>
      <div className={`${mono ? 'font-mono' : ''}`}>{children}</div>
    </div>
  );
}
