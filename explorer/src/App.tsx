import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { BlockPage } from "./pages/BlockPage";
import { HomePage } from "./pages/HomePage";
import { SearchResultsPage } from "./pages/SearchResultsPage";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto p-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/block/:height" element={<BlockPage />} />
            <Route path="/search" element={<SearchResultsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
