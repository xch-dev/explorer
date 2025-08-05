import { useDarkMode } from '@/hooks/useDarkMode';
import { BookOpenIcon, MoonIcon, PencilRulerIcon, SunIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';

export function Nav() {
  const { dark, toggle } = useDarkMode();

  const navigate = useNavigate();

  return (
    <div className='flex justify-between items-center pt-3 px-8'>
      <Link to='/' className='text-2xl font-semibold'>
        xch.dev
      </Link>

      <div className='flex items-center gap-2'>
        <Button
          onClick={() => (window.location.href = 'https://docs.xch.dev')}
          variant='outline'
          className='cursor-pointer'
        >
          <BookOpenIcon className='w-4 h-4' />
          <span className='hidden md:inline'>Docs</span>
        </Button>

        <Button
          onClick={() => navigate('/tools')}
          variant='outline'
          className='cursor-pointer'
        >
          <PencilRulerIcon className='w-4 h-4' />
          <span className='hidden md:inline'>Tools</span>
        </Button>

        <Button onClick={toggle} variant='outline'>
          {dark ? (
            <SunIcon className='w-4 h-4' />
          ) : (
            <MoonIcon className='w-4 h-4' />
          )}
          <span className='hidden md:inline'>Theme</span>
        </Button>
      </div>
    </div>
  );
}
