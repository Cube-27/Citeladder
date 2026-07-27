import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * IconChip — the empty-state icon well: a 40px accent-tinted disc
 * centered around a lucide icon (icon itself stays `size-6` at the call
 * site). The fill is `bg-accent-border`, the one accent tint with real
 * separation from the white card (accent-subtle is ΔE 1.8 — invisible);
 * the icon paints `text-accent-hover` on it (4.94:1 light / 6.11:1 dark —
 * `text-accent-text` on this fill is 3.88:1, sub-AA, so the same darker
 * rung the sidebar active label uses). Purely decorative — the
 * surrounding copy carries the meaning.
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
        'bg-accent-border text-accent-hover flex size-10 items-center justify-center rounded-full',
        className,
      )}
    >
      {children}
    </span>
  );
}
