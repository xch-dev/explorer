import { BundleViewer } from '@/components/BundleViewer';
import { External } from '@/components/External';
import { Layout } from '@/components/Layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { useCoinset } from '@/hooks/useCoinset';
import { stripHex } from '@/lib/conversions';
import { parseJson, stringify } from '@/lib/json';
import { parseSpendBundle } from '@/lib/parser';
import {
  Coin,
  CoinSpend,
  decodeOffer,
  fromHex,
  Signature,
  SpendBundle,
  toHex,
} from 'chia-wallet-sdk-wasm';
import { InfoIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLocalStorage } from 'usehooks-ts';

export function Tools() {
  const { hash } = useParams();
  const { client } = useCoinset();

  const [value, setValue] = useLocalStorage('tools-bundle', '');
  const [modified, setModified] = useState(false);

  useEffect(() => {
    if (!hash || modified) return;

    client.getBlockSpends(fromHex(stripHex(hash))).then((data) => {
      if (data.error) {
        console.error(data.error);
        return;
      }

      setValue(
        stringify(
          data.blockSpends?.map((coinSpend) => ({
            coin: {
              parent_coin_info: `0x${toHex(coinSpend.coin.parentCoinInfo)}`,
              puzzle_hash: `0x${toHex(coinSpend.coin.puzzleHash)}`,
              amount: coinSpend.coin.amount,
            },
            puzzle_reveal: `0x${toHex(coinSpend.puzzleReveal)}`,
            solution: `0x${toHex(coinSpend.solution)}`,
          })),
        ),
      );
    });
  }, [hash, client, modified, setValue]);

  const parsedSpendBundle = useMemo(() => {
    if (!value) return null;

    try {
      return parseSpendBundle(decodeOffer(value), true);
    } catch {
      // Not a valid offer
    }

    try {
      const result = parseJson(JSON.parse(value));

      if (result instanceof SpendBundle) {
        return parseSpendBundle(result, true);
      } else if (result instanceof CoinSpend) {
        return parseSpendBundle(
          new SpendBundle([result], Signature.infinity()),
          false,
        );
      } else if (result instanceof Coin) {
        return null;
      }
    } catch {
      // Not a valid spend bundle
    }

    return null;
  }, [value]);

  return (
    <Layout>
      <Textarea
        placeholder='Enter spend bundle or offer file'
        className='h-30'
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setModified(true);
        }}
      />

      {!!hash && !modified && (
        <Alert className='mt-4'>
          <InfoIcon />
          <AlertTitle>Cost may not match block</AlertTitle>
          <AlertDescription>
            <p>
              The spend bundle cost may not match the block's cost, due to{' '}
              <External href='https://chialisp.com/clvm/#back-references'>
                back-ref compression
              </External>
            </p>
          </AlertDescription>
        </Alert>
      )}

      {parsedSpendBundle && <BundleViewer bundle={parsedSpendBundle} />}
    </Layout>
  );
}
