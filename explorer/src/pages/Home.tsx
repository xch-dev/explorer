import { Layout } from '@/components/Layout';
import { Input } from '@/components/ui/input';
import { Block, getBlocks } from '@/lib/api';
import { intlFormatDistance } from 'date-fns';
import { useEffect, useState } from 'react';

export function Home() {
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    getBlocks().then(setBlocks);
  }, []);

  return (
    <Layout>
      <Input className='w-80' />

      <div className='flex flex-col gap-2 mt-4'>
        {blocks.map((block) => (
          <Block key={block.height} block={block} />
        ))}
      </div>
    </Layout>
  );
}

interface BlockProps {
  block: Block;
}

function Block({ block }: BlockProps) {
  return (
    <div className='p-3 bg-card border rounded-sm flex flex-col gap-1'>
      <div className='flex items-center'>
        <div>{block.height.toLocaleString()}</div>
      </div>

      <div className='text-md text-muted-foreground'>
        {block.transaction_info?.timestamp
          ? intlFormatDistance(
              new Date(block.transaction_info.timestamp * 1000),
              new Date(),
            )
          : 'Non-transaction block'}
      </div>
    </div>
  );
}
