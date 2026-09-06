import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The recurring product surface. Tonal contrast and spacing carry hierarchy;
 * shadows remain reserved for genuinely floating UI.
 */
export function WallpaperPanel({
  children,
  className,
  rounded = true,
  ...rest
}: Readonly<{
  children: ReactNode;
  className?: string;
  rounded?: boolean;
  id?: string;
  'aria-hidden'?: boolean;
}>) {
  return (
    <div
      className={cn(
        'bg-background-alt relative overflow-hidden',
        rounded && 'rounded-[var(--radius-card)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
