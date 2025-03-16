import { Block } from "@/api/block";
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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const response = await fetch(`http://localhost:3000/block/${height}`);
        const data = await response.json();
        setBlock(data);
      } catch (error) {
        console.error("Error fetching block:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBlock();
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

      {/* Add more cards for transactions, etc. */}
    </div>
  );
}
