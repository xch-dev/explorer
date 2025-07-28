import { useDarkMode } from '@/hooks/useDarkMode';
import { MoonIcon, SunIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';

export function Nav() {
  const { dark, toggle } = useDarkMode();

  return (
    <div className='flex justify-between items-center pt-3 px-8'>
      <Link to='/' className='text-2xl font-semibold'>
        xch.dev
      </Link>

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
