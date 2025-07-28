import { Button } from './components/ui/button';
import { DarkModeProvider } from './contexts/DarkModeContext';

function App() {
  return (
    <DarkModeProvider>
      <Button>Hello</Button>
    </DarkModeProvider>
  );
}

export default App;
