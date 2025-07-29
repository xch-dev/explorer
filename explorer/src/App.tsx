import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { DarkModeProvider } from './contexts/DarkModeContext';
import { DexieProvider } from './contexts/DexieContext';
import { MintGardenProvider } from './contexts/MintGardenContext';
import { Block } from './pages/Block';
import { Coin } from './pages/Coin';
import { Home } from './pages/Home';
import { Tools } from './pages/Tools';

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path='/' element={<Home />} />
      <Route path='/tools' element={<Tools />} />
      <Route path='/block/:hash' element={<Block />} />
      <Route path='/coin/:id' element={<Coin />} />
    </>,
  ),
);

export default function App() {
  return (
    <DarkModeProvider>
      <DexieProvider>
        <MintGardenProvider>
          <RouterProvider router={router} />
        </MintGardenProvider>
      </DexieProvider>
    </DarkModeProvider>
  );
}
