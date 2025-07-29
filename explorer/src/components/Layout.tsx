import type { PropsWithChildren } from 'react';
import { Nav } from './Nav';

export function Layout({ children }: PropsWithChildren) {
  return (
    <div>
      <Nav />

      <div className='max-w-5xl mx-auto p-4'>{children}</div>
    </div>
  );
}
