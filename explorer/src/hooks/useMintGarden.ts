import { MintGardenContext } from '@/contexts/MintGardenContext';
import { useContext } from 'react';

export function useMintGarden() {
  const context = useContext(MintGardenContext);

  if (!context) {
    throw new Error('useMintGarden must be used within a MintGardenProvider');
  }

  return context;
}
