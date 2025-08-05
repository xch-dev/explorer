import { Layout } from '@/components/Layout';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCoinset } from '@/hooks/useCoinset';
import { MAX_BLOCK_COST } from '@/lib/constants';
import { stripHex, truncateHash } from '@/lib/conversions';
import {
  BlockRecord,
  Clvm,
  fromHex,
  FullBlock,
  toHex,
} from 'chia-wallet-sdk-wasm';
import { intlFormat, intlFormatDistance } from 'date-fns';
import { CoinsIcon, HashIcon, LayersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function Home() {
  const { client, peak } = useCoinset();

  const [blockRecords, setBlockRecords] = useState<BlockRecord[]>([]);
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<BlockRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!peak) return;

    client.getBlockRecords(peak - 15, peak).then((data) => {
      if (data.error) {
        console.error(data.error);
        return;
      }

      setBlockRecords(data.blockRecords ?? []);
    });
  }, [client, peak]);

  const handleSearch = async (value: string) => {
    setSearch(value);
    setError(null);

    if (!value) {
      setSearchResult(null);
      return;
    }

    try {
      let block: BlockRecord | null = null;

      // Try parsing as block height first
      const height = parseInt(value);
      if (!isNaN(height) && height < 2 ** 32) {
        const result = await client.getBlockRecordByHeight(height);

        if (result.error) {
          console.error(result.error);
        }

        block = result.blockRecord ?? null;
      } else {
        // If not a number, try as header hash
        const result = await client.getBlockRecord(fromHex(stripHex(value)));

        if (result.error) {
          console.error(result.error);
        }

        block = result.blockRecord ?? null;
      }

      if (block) {
        setSearchResult(block);
      } else {
        setError('Block not found');
      }
    } catch {
      setError('Failed to fetch block');
    }
  };

  const displayedBlocks = searchResult ? [searchResult] : blockRecords;

  return (
    <Layout>
      <div className='flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6'>
        <h1 className='text-3xl font-semibold'>
          {searchResult ? 'Search Result' : 'Recent Blocks'}
        </h1>
        <div className='w-full md:w-80 space-y-2'>
          <Input
            className='w-full'
            placeholder='Search by height or hash...'
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {error && <div className='text-sm text-red-500'>{error}</div>}
        </div>
      </div>

      <div className='grid gap-2'>
        {displayedBlocks.map((blockRecord) => (
          <Block key={blockRecord.height} blockRecord={blockRecord} />
        ))}
      </div>
    </Layout>
  );
}

interface BlockProps {
  blockRecord: BlockRecord;
}

function Block({ blockRecord }: BlockProps) {
  const { client } = useCoinset();

  const [block, setBlock] = useState<FullBlock | null>(null);
  const [additions, setAdditions] = useState(0);
  const [removals, setRemovals] = useState(0);

  useEffect(() => {
    client.getBlock(blockRecord.headerHash).then((data) => {
      if (data.error) {
        console.error(data.error);
      }

      setBlock(data.block ?? null);
    });

    client.getBlockSpends(blockRecord.headerHash).then((data) => {
      if (data.error) {
        console.error(data.error);
      }

      const blockSpends = data.blockSpends ?? [];

      const clvm = new Clvm();

      setAdditions(
        blockSpends.reduce((acc, spend) => {
          const puzzle = clvm.deserialize(spend.puzzleReveal);
          const solution = clvm.deserialize(spend.solution);
          const conditions =
            puzzle
              .run(solution, BigInt(MAX_BLOCK_COST), false)
              .value.toList() ?? [];

          let result = acc;

          for (const condition of conditions) {
            if (condition.parseCreateCoin()) {
              result += 1;
            }
          }

          return result;
        }, 0),
      );
      setRemovals(blockSpends.length);
    });
  }, [blockRecord, client]);

  const timestamp = block?.foliageTransactionBlock
    ? new Date(Number(block.foliageTransactionBlock.timestamp) * 1000)
    : null;

  return (
    <Link
      to={`/block/${toHex(blockRecord.headerHash)}`}
      className='p-4 bg-card border rounded-lg hover:bg-accent/75 transition-colors'
    >
      <div className='flex items-start justify-between'>
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            {block?.foliageTransactionBlock ? (
              <CoinsIcon className='w-4 h-4 text-green-500' />
            ) : (
              <LayersIcon className='w-4 h-4 text-muted-foreground' />
            )}
            <div className='text-lg font-medium'>
              Block {blockRecord.height.toLocaleString()}
            </div>
          </div>

          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <HashIcon className='w-4 h-4' />
            <div className='font-mono'>
              {truncateHash(toHex(blockRecord.headerHash))}
            </div>
          </div>
        </div>

        <div className='text-right'>
          {timestamp ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='text-sm'>
                    {intlFormatDistance(timestamp, new Date())}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {intlFormat(timestamp, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </TooltipContent>
              </Tooltip>
              {block?.transactionsInfo && (
                <div className='text-sm mt-1'>
                  <span className='text-green-600'>+{additions}</span>
                  <span className='text-muted-foreground'> / </span>
                  <span className='text-red-500'>-{removals}</span>
                  <span className='text-muted-foreground'>
                    {' '}
                    coins (
                    {(
                      Number(block.transactionsInfo.cost) / MAX_BLOCK_COST
                    ).toLocaleString(undefined, {
                      style: 'percent',
                      maximumFractionDigits: 2,
                    })}{' '}
                    full)
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className='text-sm'>Non-transaction block</div>
          )}
        </div>
      </div>
    </Link>
  );
}
