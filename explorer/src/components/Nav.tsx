import { useDarkMode } from '@/hooks/useDarkMode';
import { MoonIcon, SunIcon } from 'lucide-react';
import { Button } from './ui/button';

export function Nav() {
  const { dark, toggle } = useDarkMode();

  return (
    <div className='flex justify-between items-center p-3 px-8'>
      <div className='text-2xl font-semibold'>xch.dev</div>

      <div className='flex items-center gap-2'>
        <Button onClick={toggle} variant='outline' className='w-9'>
          {dark ? (
            <SunIcon className='w-4 h-4' />
          ) : (
            <MoonIcon className='w-4 h-4' />
          )}
        </Button>
      </div>
    </div>
  );
}
