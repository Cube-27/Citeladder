'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { filterChipClasses } from './filter-chip-variants';

/**
 * Filter chip: a pill button with a hairline border; the active chip takes the
 * accent-soft fill + accent text (blue stays reserved for active states).
 *
 * The class recipe lives in `./filter-chip-variants` — the launch dialog's
 * engine chips share the visual but need `role=checkbox` semantics, so they
 * import the recipe directly rather than this component.
 */
export function FilterChip({
  active,
  onClick,
  count,
  children,
}: Readonly<{
  active: boolean;
  onClick: () => void;
  /** Optional mono count rendered after the label (muted, tabular). */
  count?: number;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={filterChipClasses(active)}
    >
      {children}
      {typeof count === 'number' ? (
        <span className={cn('mono text-2xs', active ? 'text-accent-text' : 'text-muted')}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
