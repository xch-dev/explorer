import { CoinsetContext } from '@/contexts/CoinsetContext';
import { useContext } from 'react';

export function useCoinset() {
  const context = useContext(CoinsetContext);

  if (!context) {
    throw new Error('useCoinset must be used within a CoinsetProvider');
  }

  return context;
}
