import type { Network } from '@/contexts/CoinsetContext';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useCoinset } from '@/hooks/useCoinset';
import { BookOpenIcon, MoonIcon, PencilRulerIcon, SunIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';

export function Nav() {
  const { dark, toggle } = useDarkMode();
  const { network, setNetwork } = useCoinset();

  const navigate = useNavigate();

  return (
    <div className='flex justify-between items-center pt-3 px-8'>
      <Link to='/' className='text-2xl font-semibold'>
        xch.dev
      </Link>

      <div className='flex items-center gap-2'>
        <Select
          value={network}
          onValueChange={(value) => setNetwork(value as Network)}
        >
          <SelectTrigger
            className='w-14 px-2 sm:w-[130px] sm:px-3'
            aria-label='Select network'
          >
            <span className='hidden sm:inline'>
              {network === 'testnet11' ? 'Testnet11' : 'Mainnet'}
            </span>
            <span className='sm:hidden'>
              {network === 'testnet11' ? 'T11' : 'M'}
            </span>
          </SelectTrigger>
          <SelectContent align='end'>
            <SelectItem value='mainnet'>Mainnet</SelectItem>
            <SelectItem value='testnet11'>Testnet11</SelectItem>
          </SelectContent>
        </Select>

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
