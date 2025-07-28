import type { PropsWithChildren } from 'react';
import { Nav } from './Nav';

export function Layout({ children }: PropsWithChildren) {
  return (
    <div>
      <Nav />

      <div className='p-4'>{children}</div>
    </div>
  );
}
