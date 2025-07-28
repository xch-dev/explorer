import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { DarkModeProvider } from './contexts/DarkModeContext';
import { Block } from './pages/Block';
import { Home } from './pages/Home';

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path='/' element={<Home />} />
      <Route path='/block/:hash' element={<Block />} />
    </>,
  ),
);

export default function App() {
  return (
    <DarkModeProvider>
      <RouterProvider router={router} />
    </DarkModeProvider>
  );
}
