import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

export function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const search = async () => {
      setIsLoading(true);
      try {
        // Implement your search API endpoint
        const response = await fetch(
          `http://localhost:3000/search?q=${encodeURIComponent(query ?? "")}`
        );
        const data = await response.json();
        setResults(data);
      } catch (error) {
        console.error("Error searching:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (query) {
      search();
    }
  }, [query]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Search Results</h1>
      <p className="text-muted-foreground">
        Showing results for: <span className="font-mono">{query}</span>
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : results.length === 0 ? (
            <p>No results found</p>
          ) : (
            <div className="space-y-4">
              {/* Render your search results here */}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
