import { toAddress } from '@/lib/conversions';
import { createContext, useCallback, useState, type ReactNode } from 'react';

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
  fetchNft: (launcherId: string) => Promise<Nft>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const MintGardenContext = createContext<
  MintGardenContextType | undefined
>(undefined);

export function MintGardenProvider({ children }: { children: ReactNode }) {
  const [nfts, setNfts] = useState<Record<string, Nft>>({});

  const fetchNft = useCallback(
    async (launcherId: string) => {
      if (nfts[launcherId]) {
        return nfts[launcherId];
      }

      const bech32 = toAddress(launcherId, 'nft');
      const response = await fetch(`https://api.mintgarden.io/nfts/${bech32}`);
      const nft: Nft = await response.json();

      setNfts((prev) => ({ ...prev, [launcherId]: nft }));

      return nft;
    },
    [nfts, setNfts],
  );

  return (
    <MintGardenContext.Provider value={{ fetchNft }}>
      {children}
    </MintGardenContext.Provider>
  );
}
