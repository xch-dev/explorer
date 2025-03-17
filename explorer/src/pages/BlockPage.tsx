import { Block, BlockResponse, Coin, CoinsResponse } from "@/api";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { getTimeDifference } from "../lib/utils";

export function BlockPage() {
  const { height } = useParams();
  const [block, setBlock] = useState<Block | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBlockAndCoins = async () => {
      try {
        const blockResponse = await fetch(
          `http://localhost:3000/blocks/height/${height}`
        );
        const blockData: BlockResponse = await blockResponse.json();
        setBlock(blockData.block);

        // Fetch coins after we have the block
        if (blockData.block) {
          const coinsResponse = await fetch(
            `http://localhost:3000/coins/block/${blockData.block.header_hash}`
          );
          const coinsData: CoinsResponse = await coinsResponse.json();
          setCoins(coinsData.coins);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBlockAndCoins();
  }, [height]);

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  if (!block) {
    return (
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold">Block not found</h2>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">
        Block #{block.height.toLocaleString()}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Block Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Height</dt>
              <dd className="font-mono text-lg">{block.height}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Timestamp</dt>
              <dd className="text-lg">
                {block.transaction_info
                  ? getTimeDifference(block.transaction_info.timestamp)
                  : "Non-transaction block"}
              </dd>
            </div>
            {/* Add more block details here */}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coins ({coins.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {coins.map((coin) => (
              <div
                key={coin.coin_id}
                className="p-2 border rounded text-sm hover:bg-muted"
              >
                <div className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-0.5">
                  <span className="text-muted-foreground">ID:</span>
                  <span className="font-mono truncate">{coin.coin_id}</span>
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-mono">{coin.amount}</span>
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-mono capitalize">{coin.type}</span>
                </div>
              </div>
            ))}
            {coins.length === 0 && (
              <p className="text-center text-muted-foreground md:col-span-2 lg:col-span-3">
                No coins found in this block
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add more cards for transactions, etc. */}
    </div>
  );
}
