import { Nft } from '@/contexts/MintGardenContext';
import { useDexie } from '@/hooks/useDexie';
import { useMintGarden } from '@/hooks/useMintGarden';
import { Precision, toDecimal } from '@/lib/conversions';
import { CoinType, ParsedCoinSpend, ParsedSpendBundle } from '@/lib/parser';
import { CoinsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DropdownSelector } from './DropdownSelector';
import { SpendViewer } from './SpendViewer';
import { Truncated } from './Truncated';

export interface BundleViewerProps {
  bundle: ParsedSpendBundle;
}

export function BundleViewer({ bundle }: BundleViewerProps) {
  const [selectedSpend, setSelectedSpend] = useState<ParsedCoinSpend | null>(
    bundle.coinSpends[0] ?? null,
  );
  const { getToken } = useDexie();
  const { fetchNft } = useMintGarden();

  const [nfts, setNfts] = useState<Record<string, Nft | null>>({});

  useEffect(() => {
    // Fetch NFT data for all NFT spends
    bundle.coinSpends.forEach((spend) => {
      if (spend.coin.type === CoinType.Nft) {
        const launcherId = spend.coin.assetId;
        if (nfts[launcherId] === undefined) {
          fetchNft(launcherId).then((nft) => {
            setNfts((prev) => ({ ...prev, [launcherId]: nft }));
          });
        }
      }
    });
  }, [bundle.coinSpends, fetchNft, nfts]);

  const renderCoinInfo = (spend: ParsedCoinSpend) => {
    const nft =
      spend.coin.type === CoinType.Nft ? nfts[spend.coin.assetId] : null;
    const token =
      spend.coin.type === CoinType.Cat || spend.coin.assetId === 'xch'
        ? getToken(spend.coin.assetId)
        : null;

    return (
      <div className='flex items-center gap-2 w-full'>
        {nft ? (
          <img
            src={nft.data?.thumbnail_uri}
            alt={nft.data?.metadata_json?.name ?? 'Unnamed'}
            className='w-6 h-6 rounded flex-shrink-0 object-cover'
          />
        ) : token?.icon ? (
          <img
            src={token.icon}
            alt={token.name}
            className='w-6 h-6 rounded-full flex-shrink-0'
          />
        ) : (
          <div className='w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
            <CoinsIcon className='w-3.5 h-3.5 text-primary' />
          </div>
        )}
        <div className='flex flex-col min-w-0'>
          <div className='font-medium flex flex-wrap items-center gap-1.5'>
            {nft ? (
              <span className='break-all'>
                {nft.data?.metadata_json?.name ?? 'Unnamed'}
              </span>
            ) : (
              <>
                <span className='break-all'>
                  {toDecimal(
                    spend.coin.amount,
                    spend.coin.type === CoinType.Cat ||
                      spend.coin.assetId === 'xch'
                      ? spend.coin.assetId === 'xch'
                        ? Precision.Xch
                        : Precision.Cat
                      : Precision.Singleton,
                  )}
                </span>
                <span className='text-muted-foreground font-normal'>
                  {spend.coin.type === CoinType.Cat ||
                  spend.coin.assetId === 'xch'
                    ? token?.code ||
                      (spend.coin.assetId === 'xch' ? 'XCH' : 'CAT')
                    : spend.coin.type === CoinType.Nft
                      ? 'NFT'
                      : spend.coin.type === CoinType.Did
                        ? 'DID'
                        : spend.coin.type === CoinType.Vault
                          ? 'VAULT'
                          : ''}
                </span>
              </>
            )}
          </div>
          <div className='font-mono text-xs text-muted-foreground truncate'>
            <Truncated value={spend.coin.coinId} disableCopy />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className='flex flex-col gap-4 mt-4'>
      <div className='p-4 rounded-md bg-card border border-input'>
        <div className='text-lg font-medium mb-2'>Spend Bundle</div>
        <div className='flex flex-col gap-1 text-sm'>
          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Cost</div>
            <div>{bundle.totalCost}</div>
          </div>

          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Spends</div>
            <div>{bundle.coinSpends.length}</div>
          </div>

          <div className='flex flex-col'>
            <div className='text-muted-foreground'>Bundle Hash</div>
            <Truncated value={bundle.hash} />
          </div>
        </div>
      </div>

      <div className='flex flex-col'>
        <div className='flex items-center gap-2'>
          <DropdownSelector
            loadedItems={bundle.coinSpends}
            onSelect={setSelectedSpend}
            renderItem={(spend) => renderCoinInfo(spend)}
            width='w-[350px]'
            className='rounded-b-none'
          >
            {selectedSpend ? (
              renderCoinInfo(selectedSpend)
            ) : (
              <div className='text-muted-foreground'>
                Select a spend to view
              </div>
            )}
          </DropdownSelector>
        </div>

        {selectedSpend && (
          <SpendViewer
            spend={selectedSpend}
            className='border-t-0 rounded-t-none'
          />
        )}
      </div>
    </div>
  );
}
