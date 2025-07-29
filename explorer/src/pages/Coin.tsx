import { Layout } from '@/components/Layout';
import { CoinRecord, getCoin } from '@/lib/api';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function Coin() {
  const { id } = useParams();

  const [coin, setCoin] = useState<CoinRecord | null>(null);

  useEffect(() => {
    if (!id) return;

    getCoin(id).then(setCoin);
  }, [id]);

  return <Layout>{coin?.coin.amount}</Layout>;
}
