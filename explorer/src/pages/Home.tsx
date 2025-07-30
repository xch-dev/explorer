import { Layout } from '@/components/Layout';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BlockRecord, getBlock, getBlockByHeight, getBlocks } from '@/lib/api';
import { MAX_BLOCK_COST } from '@/lib/constants';
import { truncateHash } from '@/lib/conversions';
import { intlFormat, intlFormatDistance } from 'date-fns';
import { CoinsIcon, HashIcon, LayersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function Home() {
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<BlockRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBlocks().then(setBlocks);
  }, []);

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
        block = await getBlockByHeight(height);
      } else {
        // If not a number, try as header hash
        block = await getBlock(value);
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

  const displayedBlocks = searchResult ? [searchResult] : blocks;

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
        {displayedBlocks.map((block) => (
          <Block key={block.height} block={block} />
        ))}
      </div>
    </Layout>
  );
}

interface BlockProps {
  block: BlockRecord;
}

function Block({ block }: BlockProps) {
  const timestamp = block.transaction_info
    ? new Date(block.transaction_info.timestamp * 1000)
    : null;

  return (
    <Link
      to={`/block/${block.header_hash}`}
      className='p-4 bg-card border rounded-lg hover:bg-accent/75 transition-colors'
    >
      <div className='flex items-start justify-between'>
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            {block.transaction_info ? (
              <CoinsIcon className='w-4 h-4 text-green-500' />
            ) : (
              <LayersIcon className='w-4 h-4 text-muted-foreground' />
            )}
            <div className='text-lg font-medium'>
              Block {block.height.toLocaleString()}
            </div>
          </div>

          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <HashIcon className='w-4 h-4' />
            <div className='font-mono'>{truncateHash(block.header_hash)}</div>
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
              {block.transaction_info && (
                <div className='text-sm mt-1'>
                  <span className='text-green-600'>
                    +{block.transaction_info.additions}
                  </span>
                  <span className='text-muted-foreground'> / </span>
                  <span className='text-red-500'>
                    -{block.transaction_info.removals}
                  </span>
                  <span className='text-muted-foreground'>
                    {' '}
                    coins (
                    {(
                      block.transaction_info.cost / MAX_BLOCK_COST
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
