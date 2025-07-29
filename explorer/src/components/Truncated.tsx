import { CopyCheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export interface TruncatedProps {
  value: string;
  href?: string;
  disableCopy?: boolean;
}

export function Truncated({
  value,
  href,
  disableCopy = false,
}: TruncatedProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (event: React.MouseEvent<SVGSVGElement>) => {
    event.stopPropagation();

    navigator.clipboard.writeText(value);

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 500);
  };

  return (
    <div className='flex items-center gap-1'>
      <div
        className={`truncate max-w-60 ${href ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:dark:text-blue-300' : ''}`}
      >
        {href ? <Link to={href}>{value}</Link> : value}
      </div>
      {disableCopy ? null : copied ? (
        <CopyCheckIcon className='size-4 text-green-500' />
      ) : (
        <CopyIcon className='size-4' onClick={handleCopy} />
      )}
    </div>
  );
}
