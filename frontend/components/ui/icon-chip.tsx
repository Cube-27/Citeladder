import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * IconChip — a 40px accent-tinted well squared off to the control radius,
 * centered around a lucide icon (icon itself stays `size-6` at the call site).
 * Discs read as decoration; a square well reads as part of the grid, which is
 * what an editorial layout wants. The fill is `bg-accent-subtle` against the
 * paper canvas, and the icon paints `text-accent-text` on it. Purely
 * decorative — the surrounding copy carries the meaning.
 */
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
        'bg-accent-subtle text-accent-text flex size-10 items-center justify-center rounded-[var(--radius-control)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
