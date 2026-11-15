import { useEffect, useState, type ReactNode } from 'react';

import { LOADING_INDICATOR_DELAY_MS } from '@/lib/config/operational';
import { cn } from '@/lib/utils';

/**
 * The parts every loading shape is made of, kept apart from `Skeleton`'s
 * variants so the shell's loading state does not carry them on boot.
 */

/** One placeholder: a `well` block, at least 12 high. */
export function SkeletonBlock({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      data-skeleton-block=""
      className={cn('skeleton-block bg-well rounded-control block h-3 min-h-3', className)}
    />
  );
}

/** Unequal widths, so a text block does not read as a ruled form. */
export const TEXT_WIDTHS = ['w-11/12', 'w-3/4', 'w-1/2'] as const;

/** A card body of list rows: a title block over a caption block, 56 apart. */
export function RowBlocks({ rows = 4 }: Readonly<{ rows?: number }>) {
  return (
    <span className="grid">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="grid h-14 content-center gap-2">
          <SkeletonBlock className={cn('h-4', TEXT_WIDTHS[index % 2])} />
          <SkeletonBlock className="h-3 w-1/3" />
        </span>
      ))}
    </span>
  );
}

/** A loading shape's frame: busy, with only its verb announced, after a beat. */
export function SkeletonFrame({
  label,
  variant,
  className,
  children,
}: Readonly<{ label: string; variant: string; className?: string; children: ReactNode }>) {
  return (
    <div aria-busy="true" data-skeleton={variant} className={cn('min-w-0', className)}>
      <LiveVerb label={label} />
      {children}
    </div>
  );
}

/**
 * Loaders on screen that have already been revealed. A cold load passes
 * through several owners in turn (shell, route chunk, first read); a loader
 * that mounts while another is showing is the same wait, so it starts revealed.
 */
let revealedLoaders = 0;

/**
 * What is loading ("Loading runs"), announced after a beat
 * (`LOADING_INDICATOR_DELAY_MS`) and never drawn: the blocks show that it loads.
 */
export function LiveVerb({ label }: Readonly<{ label: string }>) {
  const [revealed, setRevealed] = useState(() => revealedLoaders > 0);
  useEffect(() => {
    if (!revealed) {
      const timer = setTimeout(() => setRevealed(true), LOADING_INDICATOR_DELAY_MS);
      return () => clearTimeout(timer);
    }
    revealedLoaders += 1;
    return () => {
      revealedLoaders -= 1;
    };
  }, [revealed]);
  return revealed ? <output aria-label={label} className="sr-only" /> : null;
}
