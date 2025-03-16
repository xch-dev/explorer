import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <nav className="border-b">
      <div className="container mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          <a href="/" className="text-2xl font-bold text-primary">
            xch.dev
          </a>
          <form onSubmit={handleSearch} className="flex gap-2 w-1/2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by block hash, height, or transaction hash..."
              className="flex-1"
            />
            <Button type="submit">Search</Button>
          </form>
        </div>
      </div>
    </nav>
  );
}
