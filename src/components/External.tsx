import { ExternalLinkIcon } from 'lucide-react';
import { PropsWithChildren } from 'react';

export interface ExternalProps extends PropsWithChildren {
  href: string;
}

export function External({ href, children }: ExternalProps) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:dark:text-blue-300 inline-flex items-center gap-1'
    >
      {children}
      <ExternalLinkIcon className='size-4' />
    </a>
  );
}
