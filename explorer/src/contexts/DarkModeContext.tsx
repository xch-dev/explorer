import { createContext, useEffect, type ReactNode } from 'react';
import { useLocalStorage } from 'usehooks-ts';

export interface DarkModeContextType {
  dark: boolean;
  setDark: (dark: boolean) => void;
  toggle: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const DarkModeContext = createContext<DarkModeContextType | undefined>(
  undefined,
);

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useLocalStorage('dark', false);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(dark ? 'light' : 'dark');
    root.classList.add(dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <DarkModeContext.Provider
      value={{ dark, setDark, toggle: () => setDark(!dark) }}
    >
      {children}
    </DarkModeContext.Provider>
  );
}
