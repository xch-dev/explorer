import { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';

export interface ColoredLinkProps extends PropsWithChildren {
  href: string;
}

export function ColoredLink({ href, children }: ColoredLinkProps) {
  return (
    <Link
      to={href}
      className='text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:dark:text-blue-300 inline-flex items-center gap-1'
    >
      {children}
    </Link>
  );
}
