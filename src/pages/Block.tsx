import { External } from '@/components/External';
import { Layout } from '@/components/Layout';
import { Truncated } from '@/components/Truncated';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Nft } from '@/contexts/MintGardenContext';
import { useCoinset } from '@/hooks/useCoinset';
import { useDexie } from '@/hooks/useDexie';
import { useMintGarden } from '@/hooks/useMintGarden';
import { Precision, stripHex, toAddress, toDecimal } from '@/lib/conversions';
import { ParsedCoin } from '@/lib/parser';
import { parseBlockSpends } from '@/lib/parser/blockSpends';
import { CoinSpend, fromHex, FullBlock, toHex } from 'chia-wallet-sdk-wasm';
import { intlFormat } from 'date-fns';
import {
  CoinsIcon,
  DatabaseIcon,
  EyeIcon,
  HashIcon,
  LayersIcon,
} from 'lucide-react';
import { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

export function Block() {
  const { hash } = useParams();
  const { client } = useCoinset();

  const navigate = useNavigate();

  const [block, setBlock] = useState<FullBlock | null>(null);
  const [blockSpends, setBlockSpends] = useState<CoinSpend[] | null>(null);

  useEffect(() => {
    if (!hash) return;

    const headerHash = fromHex(stripHex(hash));

    client.getBlock(headerHash).then((data) => {
      if (data.error) {
        console.error(data.error);
      }

      setBlock(data.block ?? null);
    });

    client.getBlockSpends(headerHash).then((data) => {
      if (data.error) {
        console.error(data.error);
      }

      setBlockSpends(data.blockSpends ?? []);
    });
  }, [hash, client]);

  const parsed = useMemo(() => {
    if (!block || !blockSpends) return null;

    return parseBlockSpends(
      block.transactionsInfo?.rewardClaimsIncorporated ?? [],
      blockSpends,
    );
  }, [block, blockSpends]);

  const timestamp = block?.foliageTransactionBlock
    ? new Date(Number(block.foliageTransactionBlock.timestamp) * 1000)
    : null;

  return (
    <Layout>
      <div className='flex items-baseline gap-3 mb-2'>
        <h1 className='text-3xl font-semibold'>
          Block {block?.rewardChainBlock.height.toString() ?? 'loading...'}
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
                  <Truncated value={hash ?? ''} href={`/block/${hash}`} />
                </Field>
                <Field label='Previous Block'>
                  <Truncated
                    value={toHex(block.foliage.prevBlockHash)}
                    href={`/block/${toHex(block.foliage.prevBlockHash)}`}
                  />
                </Field>
                {block.foliageTransactionBlock?.prevTransactionBlockHash && (
                  <Field label='Previous Transaction Block'>
                    <Truncated
                      value={toHex(
                        block.foliageTransactionBlock.prevTransactionBlockHash,
                      )}
                      href={`/block/${toHex(block.foliageTransactionBlock.prevTransactionBlockHash)}`}
                    />
                  </Field>
                )}
                <Field label='Farmer Address'>
                  <Truncated
                    value={toAddress(
                      toHex(
                        block.foliage.foliageBlockData.farmerRewardPuzzleHash,
                      ),
                    )}
                  />
                </Field>
                {block.rewardChainBlock.proofOfSpace.poolContractPuzzleHash && (
                  <Field label='Pool Address'>
                    <Truncated
                      value={toAddress(
                        toHex(
                          block.rewardChainBlock.proofOfSpace
                            .poolContractPuzzleHash,
                        ),
                      )}
                    />
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
                  {block.rewardChainBlock.totalIters.toLocaleString()}
                </Field>
                <Field label='Weight'>
                  {block.rewardChainBlock.weight.toLocaleString()}
                </Field>
                {block.transactionsInfo && (
                  <>
                    <Field label='Transaction Cost'>
                      {block.transactionsInfo.cost.toLocaleString()}
                    </Field>
                    <Field label='Transaction Fees'>
                      {`${toDecimal(block.transactionsInfo.fees, Precision.Xch)} XCH`}
                    </Field>
                  </>
                )}
              </div>
            </section>
          </div>

          {block?.transactionsInfo && parsed ? (
            <>
              <div className='grid md:grid-cols-2 gap-4 mt-6'>
                <div>
                  <div className='flex items-center gap-2 mb-4'>
                    <CoinsIcon className='w-5 h-5' />
                    <h2 className='text-xl font-medium'>Spent</h2>
                    <div className='text-lg text-red-600'>
                      -{parsed.removals.length}
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => navigate(`/tools/${hash}`)}
                    >
                      <EyeIcon className='w-4 h-4' />
                      View
                    </Button>
                  </div>
                  <div className='space-y-2'>
                    {parsed.removals.map((coin) => (
                      <CoinCard
                        key={`spent-${coin.coinId}`}
                        coin={coin}
                        isCreated={
                          parsed.additions.findIndex(
                            (c) => c.coinId === coin.coinId,
                          ) !== -1
                        }
                        isSpent={true}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className='flex items-center gap-2 mb-4'>
                    <CoinsIcon className='w-5 h-5' />
                    <h2 className='text-xl font-medium'>Created</h2>
                    <div className='text-lg text-green-600'>
                      +{parsed.additions.length}
                    </div>
                  </div>
                  <div className='space-y-2'>
                    {parsed.additions.map((coin) => (
                      <CoinCard
                        key={`created-${coin.coinId}`}
                        coin={coin}
                        isCreated={true}
                        isSpent={
                          parsed.removals.findIndex(
                            (c) => c.coinId === coin.coinId,
                          ) !== -1
                        }
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
  coin: ParsedCoin;
  isCreated: boolean;
  isSpent: boolean;
}

function CoinCard({ coin, isCreated, isSpent }: CoinCardProps) {
  const { getToken } = useDexie();
  const { fetchNft } = useMintGarden();
  const [nft, setNft] = useState<Nft | null | undefined>(undefined);

  useEffect(() => {
    if (nft !== undefined) return;

    if (coin.type === 'nft') {
      fetchNft(coin.assetId).then(setNft);
    }
  }, [coin, fetchNft, nft]);

  const token =
    coin.type === 'cat'
      ? getToken(coin.assetId)
      : coin.type === 'unknown' || coin.type === 'reward'
        ? getToken('xch')
        : null;

  return (
    <Link
      to={`/coin/${coin.coinId}`}
      className='block bg-card border rounded-lg hover:bg-accent/75 transition-colors overflow-hidden'
    >
      <div className='p-1.5'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex items-center gap-2 min-w-0 flex-1'>
            {nft ? (
              <img
                src={nft.data?.thumbnail_uri}
                alt={nft.data?.metadata_json?.name ?? 'Unnamed'}
                className='w-6 h-6 rounded flex-shrink-0 object-cover'
              />
            ) : token?.icon ? (
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
                {nft ? (
                  <span className='break-all'>
                    {nft.data?.metadata_json?.name ?? 'Unnamed'}
                  </span>
                ) : (
                  <>
                    <span className='break-all'>
                      {toDecimal(
                        coin.amount,
                        coin.type === 'cat'
                          ? Precision.Cat
                          : coin.type === 'unknown' || coin.type == 'reward'
                            ? Precision.Xch
                            : Precision.Singleton,
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
                  </>
                )}
              </div>
              <div className='font-mono text-xs text-muted-foreground truncate'>
                <Truncated value={coin.coinId} disableCopy />
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
