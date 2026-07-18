import { CoinsetClient } from 'chia-wallet-sdk-wasm';
import {
  useCallback,
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Network = 'mainnet' | 'testnet11';

export interface CoinsetContextType {
  client: CoinsetClient;
  peak: number;
  network: Network;
  setNetwork: (network: Network) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CoinsetContext = createContext<CoinsetContextType | undefined>(
  undefined,
);

export function CoinsetProvider({ children }: { children: ReactNode }) {
  const [peak, setPeak] = useState(0);
  const [network, setNetwork] = useState<Network>(() => {
    return localStorage.getItem('network') === 'testnet11'
      ? 'testnet11'
      : 'mainnet';
  });

  const changeNetwork = useCallback((network: Network) => {
    setPeak(0);
    setNetwork(network);
    localStorage.setItem('network', network);
  }, []);

  const client = useMemo(() => {
    return network === 'testnet11'
      ? CoinsetClient.testnet11()
      : CoinsetClient.mainnet();
  }, [network]);

  useEffect(() => {
    let cancelled = false;

    const updatePeak = () => {
      client.getBlockchainState().then((data) => {
        if (!cancelled) {
          setPeak(data.blockchainState?.peak.height ?? 0);
        }
      });
    };

    updatePeak();

    let websocket: WebSocket | undefined;
    let reconnectTimeout: number | undefined;

    const connect = () => {
      const websocketUrl =
        network === 'testnet11'
          ? 'wss://testnet11.api.coinset.org/ws'
          : 'wss://api.coinset.org/ws';

      websocket = new WebSocket(websocketUrl);
      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'peak') {
          setPeak(message.data.height);
        }
      };
      websocket.onclose = () => {
        if (!cancelled) {
          reconnectTimeout = window.setTimeout(connect, 1_000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimeout);
      websocket?.close();
    };
  }, [client, network]);

  return (
    <CoinsetContext.Provider
      value={{ client, peak, network, setNetwork: changeNetwork }}
    >
      {children}
    </CoinsetContext.Provider>
  );
}
