import { Block } from "@/api/block";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { getTimeDifference } from "../lib/utils";

export function HomePage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBlocks = async () => {
      try {
        const response = await fetch(
          "http://localhost:3000/blocks?reverse=true"
        );
        const data = await response.json();
        setBlocks(data);
      } catch (error) {
        console.error("Error fetching blocks:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBlocks();
    const interval = setInterval(fetchBlocks, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Latest Block</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {blocks[0]?.height.toLocaleString() ?? "Loading..."}
            </p>
          </CardContent>
        </Card>
        {/* Add more stats cards here */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Recent Blocks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b pb-4"
                  >
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </>
            ) : blocks.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No blocks found
              </p>
            ) : (
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left">Block Height</th>
                      <th className="p-4 text-left">Age</th>
                      <th className="p-4 text-left">Net Coins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((block) => (
                      <tr
                        key={block.height}
                        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/block/${block.height}`)}
                      >
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-medium">
                              {block.height.toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {block.transaction_info
                            ? getTimeDifference(
                                block.transaction_info.timestamp
                              )
                            : ""}
                        </td>
                        <td className="p-4">
                          {block.transaction_info
                            ? `${(block.transaction_info.additions - block.transaction_info.removals).toLocaleString()} coins`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
