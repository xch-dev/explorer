import { Layout } from '@/components/Layout';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BlockRecord, getBlocks } from '@/lib/api';
import { intlFormat, intlFormatDistance } from 'date-fns';
import { CoinsIcon, HashIcon, LayersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function Home() {
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getBlocks().then(setBlocks);
  }, []);

  return (
    <Layout>
      <div className='flex items-center justify-between mb-6'>
        <h1 className='text-3xl font-semibold'>Recent Blocks</h1>
        <Input
          className='w-80'
          placeholder='Search by height or hash...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className='grid gap-2'>
        {blocks
          .filter(
            (block) =>
              search === '' ||
              block.height.toString().includes(search) ||
              block.header_hash.toLowerCase().includes(search.toLowerCase()),
          )
          .map((block) => (
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
      className='p-4 bg-card border rounded-lg hover:border-primary/50 transition-colors'
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
            <div className='font-mono'>
              {block.header_hash.slice(0, 8)}...{block.header_hash.slice(-8)}
            </div>
          </div>
        </div>

        <div className='text-right'>
          {timestamp ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='text-sm text-muted-foreground'>
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
                  {' / '}
                  <span className='text-red-500'>
                    -{block.transaction_info.removals}
                  </span>
                  {' coins'}
                </div>
              )}
            </>
          ) : (
            <div className='text-sm text-muted-foreground'>
              Non-transaction block
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
