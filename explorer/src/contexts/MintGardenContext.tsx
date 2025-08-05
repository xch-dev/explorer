import { toAddress } from '@/lib/conversions';
import { RateLimiter } from 'limiter';
import {
  createContext,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface Nft {
  id: string;
  encoded_id: string;
  data?: {
    thumbnail_uri?: string;
    preview_uri?: string;
    metadata_json?: {
      name?: string;
    };
  };
}

export interface MintGardenContextType {
  fetchNft: (launcherId: string) => Promise<Nft | null>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const MintGardenContext = createContext<
  MintGardenContextType | undefined
>(undefined);

export function MintGardenProvider({ children }: { children: ReactNode }) {
  const [nfts, setNfts] = useState<Record<string, Nft>>({});
  // Allow 2 requests per second
  const rateLimiter = useRef(
    new RateLimiter({ tokensPerInterval: 2, interval: 'second' }),
  );

  const fetchNft = useCallback(
    async (launcherId: string) => {
      if (nfts[launcherId]) {
        return nfts[launcherId];
      }

      try {
        await rateLimiter.current.removeTokens(1);

        const bech32 = launcherId.startsWith('nft')
          ? launcherId
          : toAddress(launcherId, 'nft');
        const response = await fetch(
          `https://api.mintgarden.io/nfts/${bech32}`,
        );
        const nft: Nft = await response.json();

        setNfts((prev) => ({ ...prev, [launcherId]: nft }));

        return nft;
      } catch (error) {
        console.error(error);

        return null;
      }
    },
    [nfts, setNfts],
  );

  return (
    <MintGardenContext.Provider value={{ fetchNft }}>
      {children}
    </MintGardenContext.Provider>
  );
}
