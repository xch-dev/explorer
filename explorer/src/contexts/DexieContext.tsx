import { createContext, useEffect, useState, type ReactNode } from 'react';

export interface Token {
  id: string;
  code: string;
  name: string;
  denom: number;
  icon: string;
}

export interface DexieContextType {
  getToken: (id: string) => Token | null;
}

// eslint-disable-next-line react-refresh/only-export-components
export const DexieContext = createContext<DexieContextType | undefined>(
  undefined,
);

export function DexieProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<Record<string, Token>>({});

  useEffect(() => {
    fetch('https://api.dexie.space/v1/tokens')
      .then((res) => res.json())
      .then((data) => {
        const tokens: Token[] = data.tokens;

        if (!Array.isArray(tokens)) {
          throw new Error('Invalid tokens');
        }

        setTokens(
          tokens.reduce(
            (acc, token) => {
              acc[token.id] = token;
              return acc;
            },
            {} as Record<string, Token>,
          ),
        );
      });
  }, []);

  const getToken = (id: string) => tokens[id.replace('0x', '')] ?? null;

  return (
    <DexieContext.Provider value={{ getToken }}>
      {children}
    </DexieContext.Provider>
  );
}
