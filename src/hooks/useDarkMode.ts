import { DarkModeContext } from '@/contexts/DarkModeContext';
import { useContext } from 'react';

export function useDarkMode() {
  const context = useContext(DarkModeContext);

  if (!context) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }

  return context;
}
