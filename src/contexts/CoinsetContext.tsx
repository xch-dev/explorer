import { CoinsetClient } from 'chia-wallet-sdk-wasm';
import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface CoinsetContextType {
  client: CoinsetClient;
  peak: number;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CoinsetContext = createContext<CoinsetContextType | undefined>(
  undefined,
);

export function CoinsetProvider({ children }: { children: ReactNode }) {
  const [peak, setPeak] = useState(0);

  const client = useMemo(() => {
    return CoinsetClient.mainnet();
  }, []);

  useEffect(() => {
    client.getBlockchainState().then((data) => {
      setPeak(data.blockchainState?.peak.height ?? 0);
    });
  }, [client]);

  const [websocket, setWebsocket] = useState<WebSocket>(createWebsocket);

  useEffect(() => {
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'peak':
          setPeak(message.data.height);
          break;
      }
    };

    websocket.onclose = () => {
      setWebsocket(createWebsocket());
    };

    return () => {
      websocket.close();
    };
  }, [websocket]);

  return (
    <CoinsetContext.Provider value={{ client, peak }}>
      {children}
    </CoinsetContext.Provider>
  );
}

function createWebsocket() {
  return new WebSocket('wss://api.coinset.org/ws');
}
