import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Skeleton } from "./components/ui/skeleton";

// Type for our block data
interface Block {
  height: number;
  transaction_info: {
    timestamp: number;
  };
}

function App() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchBlocks = async () => {
      try {
        const response = await fetch(
          "http://localhost:3000/blocks?reverse=true"
        );
        const data = await response.json();
        console.log(data);
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

  // Function to format time difference
  const getTimeDifference = (timestamp: number) => {
    const diff = Date.now() - timestamp * 1000;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) {
      return seconds <= 1 ? "Just now" : `${seconds} seconds ago`;
    }
    if (minutes < 60) {
      return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
    }
    if (hours < 24) {
      return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
    }
    if (days < 7) {
      return days === 1 ? "1 day ago" : `${days} days ago`;
    }

    // For timestamps older than a week, show the actual date
    return new Date(timestamp * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year:
        timestamp * 1000 < Date.now() - 365 * 24 * 60 * 60 * 1000
          ? "numeric"
          : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <header className="mb-8 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-primary mb-4">
          Chia Block Explorer
        </h1>
        <div className="flex gap-2">
          <Input
            placeholder="Search by block hash, height, or transaction hash..."
            className="flex-1"
          />
          <Button variant="default">Search</Button>
        </div>
      </header>

      <Card className="max-w-6xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Recent Blocks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading ? (
              // Loading skeletons for better UX
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
              blocks.map((block) => (
                <div
                  key={block.height}
                  className="flex items-center justify-between border-b pb-4 hover:bg-muted/50 rounded-lg p-4 transition-colors"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-lg">
                      Block #{block.height.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {block.transaction_info
                        ? getTimeDifference(block.transaction_info.timestamp)
                        : "Non-transaction block"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
