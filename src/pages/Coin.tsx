import { ColoredLink } from '@/components/ColoredLink';
import { Layout } from '@/components/Layout';
import { SpendViewer } from '@/components/SpendViewer';
import { Truncated } from '@/components/Truncated';
import { Nft } from '@/contexts/MintGardenContext';
import { useCoinset } from '@/hooks/useCoinset';
import { useDexie } from '@/hooks/useDexie';
import { useMintGarden } from '@/hooks/useMintGarden';
import { Precision, stripHex, toDecimal } from '@/lib/conversions';
import {
  CoinType,
  parseCoin,
  ParsedCoin,
  ParsedCoinSpend,
  parseSpendBundle,
} from '@/lib/parser';
import {
  BlockRecord,
  CoinRecord,
  CoinSpend,
  fromHex,
  Signature,
  SpendBundle,
  toHex,
} from 'chia-wallet-sdk-wasm';
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
  const { client } = useCoinset();
  const { getToken } = useDexie();
  const { fetchNft } = useMintGarden();

  const [coinRecord, setCoinRecord] = useState<CoinRecord | null>(null);
  const [createdBlock, setCreatedBlock] = useState<BlockRecord | null>(null);
  const [spentBlock, setSpentBlock] = useState<BlockRecord | null>(null);
  const [nft, setNft] = useState<Nft | null | undefined>(undefined);
  const [coin, setCoin] = useState<ParsedCoin | null>(null);
  const [coinSpend, setCoinSpend] = useState<ParsedCoinSpend | null>(null);

  useEffect(() => {
    if (!id) return;

    client.getCoinRecordByName(fromHex(stripHex(id))).then((data) => {
      if (data.error) {
        console.error(data.error);
        return;
      }

      setCoinRecord(data.coinRecord ?? null);
    });
  }, [id, client]);

  useEffect(() => {
    if (!coinRecord) return;

    client
      .getBlockRecordByHeight(coinRecord.confirmedBlockIndex)
      .then((data) => {
        if (data.error) {
          console.error(data.error);
          return;
        }

        setCreatedBlock(data.blockRecord ?? null);
      });

    if (coinRecord.spentBlockIndex) {
      client.getBlockRecordByHeight(coinRecord.spentBlockIndex).then((data) => {
        if (data.error) {
          console.error(data.error);
          return;
        }

        setSpentBlock(data.blockRecord ?? null);
      });
    }

    if (coinRecord.coinbase) {
      setCoin(parseCoin(coinRecord.coin, CoinType.Reward, 'xch'));

      client.getPuzzleAndSolution(coinRecord.coin.coinId()).then((spend) => {
        if (!spend.coinSolution) {
          return;
        }

        const parsed = parseSpendBundle(
          new SpendBundle(
            [
              new CoinSpend(
                coinRecord.coin,
                spend.coinSolution.puzzleReveal,
                spend.coinSolution.solution,
              ),
            ],
            Signature.infinity(),
          ),
          false,
        );

        setCoin(parsed.coinSpends[0].coin);
        setCoinSpend(parsed.coinSpends[0]);
      });
    } else {
      Promise.all([
        client.getCoinRecordByName(coinRecord.coin.parentCoinInfo),
        client.getPuzzleAndSolution(coinRecord.coin.parentCoinInfo),
        client.getPuzzleAndSolution(coinRecord.coin.coinId()),
      ]).then(([parent, parentSpend, spend]) => {
        if (spend.coinSolution) {
          const parsed = parseSpendBundle(
            new SpendBundle(
              [
                new CoinSpend(
                  coinRecord.coin,
                  spend.coinSolution.puzzleReveal,
                  spend.coinSolution.solution,
                ),
              ],
              Signature.infinity(),
            ),
            false,
          );

          setCoin(parsed.coinSpends[0].coin);
          setCoinSpend(parsed.coinSpends[0]);

          return;
        }

        if (parent.error) {
          console.error(parent.error);
          return;
        }

        if (!parent.coinRecord) {
          console.error('No parent coin record found');
          return;
        }

        if (parentSpend.error) {
          console.error(parentSpend.error);
          return;
        }

        if (!parentSpend.coinSolution) {
          console.error('No coin solution found');
          return;
        }

        const parsed = parseSpendBundle(
          new SpendBundle(
            [
              new CoinSpend(
                parent.coinRecord.coin,
                parentSpend.coinSolution.puzzleReveal,
                parentSpend.coinSolution.solution,
              ),
            ],
            Signature.infinity(),
          ),
          false,
        );

        setCoin(
          parsed.coinSpends[0].outputs.filter(
            (c) => stripHex(c.coinId) === toHex(coinRecord.coin.coinId()),
          )[0],
        );
      });
    }
  }, [coinRecord, client]);

  useEffect(() => {
    if (nft !== undefined) return;

    if (coin?.type === 'nft') {
      fetchNft(coin.assetId).then(setNft);
    }
  }, [coin, fetchNft, nft]);

  const token = coin
    ? coin.type === 'cat'
      ? getToken(coin.assetId)
      : coin.assetId === 'xch'
        ? getToken('xch')
        : null
    : null;

  const icon = token?.icon ?? nft?.data?.thumbnail_uri;
  const name = token?.name ?? nft?.data?.metadata_json?.name;

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
                    {coin?.assetId && coin.assetId !== 'xch' && (
                      <div className='font-mono text-sm'>
                        <Truncated value={coin.assetId} />
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
              {coinRecord?.spentBlockIndex ? (
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
          <div className='grid gap-3'>
            <div className='grid gap-3 lg:grid-cols-2'>
              <section className='bg-card border rounded-xl p-4 shadow-sm'>
                <h2 className='text-xl font-medium mb-4 flex items-center gap-2 pb-3 border-b'>
                  <HashIcon className='w-5 h-5 text-primary' />
                  Information
                </h2>
                <div className='grid gap-4 text-sm'>
                  <Field label='Coin ID' mono>
                    <Truncated
                      value={coin.coinId}
                      href={`/coin/${coin.coinId}`}
                    />
                  </Field>
                  <Field label='Parent Coin' mono>
                    <Truncated
                      value={coin.parentCoinInfo}
                      href={`/coin/${coin.parentCoinInfo}`}
                    />
                  </Field>
                  <Field label='Puzzle Hash' mono>
                    <Truncated value={coin.puzzleHash} />
                  </Field>
                  {coin.hint && (
                    <Field label='Hint' mono>
                      <Truncated value={coin.hint} />
                    </Field>
                  )}
                </div>
              </section>

              <section className='bg-card border rounded-xl p-4 shadow-sm'>
                <h2 className='text-xl font-medium mb-4 flex items-center gap-2 pb-3 border-b'>
                  <LayersIcon className='w-5 h-5 text-primary' />
                  Asset Details
                </h2>
                <div className='grid gap-4 text-sm'>
                  <Field label='Asset Type'>
                    <span className='inline-block mt-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary font-medium'>
                      {coin.type === 'unknown'
                        ? 'Unknown'
                        : coin.type === 'reward'
                          ? 'Reward'
                          : coin.type === 'cat'
                            ? 'CAT2'
                            : coin.type === 'vault'
                              ? 'Vault'
                              : coin.type === 'nft'
                                ? 'NFT1'
                                : 'DID1'}
                    </span>
                  </Field>
                  <Field label='Amount'>
                    <div className='font-medium flex flex-wrap items-center gap-1.5 text-base'>
                      <span className='text-lg'>
                        {toDecimal(
                          coin.amount,
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

            <section className='bg-card border rounded-xl p-4 shadow-sm'>
              <h2 className='text-xl font-medium mb-4 flex items-center gap-2 pb-3 border-b'>
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
                      <ColoredLink
                        href={`/block/${createdBlock?.headerHash ? toHex(createdBlock.headerHash) : ''}`}
                      >
                        {coinRecord?.confirmedBlockIndex?.toLocaleString()}
                      </ColoredLink>
                      {createdBlock?.timestamp && (
                        <span className='text-muted-foreground'>
                          {intlFormat(Number(createdBlock.timestamp) * 1000, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className='flex items-start gap-4'>
                  {coinRecord?.spentBlockIndex ? (
                    <>
                      <div className='w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0'>
                        <ArrowUpCircleIcon className='w-5 h-5 text-blue-500' />
                      </div>
                      <div>
                        <div className='font-medium mb-1'>Spent at Height</div>
                        <div className='flex items-center gap-2'>
                          <ColoredLink
                            href={`/block/${spentBlock?.headerHash ? toHex(spentBlock.headerHash) : ''}`}
                          >
                            {coinRecord?.spentBlockIndex?.toLocaleString()}
                          </ColoredLink>
                          {spentBlock?.timestamp && (
                            <span className='text-muted-foreground'>
                              {intlFormat(Number(spentBlock.timestamp) * 1000, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
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

        {coinSpend && <SpendViewer spend={coinSpend} />}
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
    <div>
      <div className='text-muted-foreground font-medium'>{label}</div>
      <div className={`${mono ? 'font-mono' : ''}`}>{children}</div>
    </div>
  );
}
