import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/** A neutral icon well; status-bearing callers supply their semantic tone. */
export function IconChip({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={cn(
        'bg-well text-secondary flex size-10 items-center justify-center rounded-[var(--radius-card)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
