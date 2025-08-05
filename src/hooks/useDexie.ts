import { DexieContext } from '@/contexts/DexieContext';
import { useContext } from 'react';

export function useDexie() {
  const context = useContext(DexieContext);

  if (!context) {
    throw new Error('useDexie must be used within a DexieProvider');
  }

  return context;
}
