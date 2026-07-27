import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The recurring product surface: one wallpaper field with white interface
 * windows floating on it. Every product moment on the marketing and auth
 * surfaces uses this frame, which is what makes scenes on different pages
 * read as the same product rather than as separate illustrations.
 */
export function WallpaperPanel({
  children,
  className,
  ...rest
}: Readonly<{ children: ReactNode; className?: string; id?: string; 'aria-hidden'?: boolean }>) {
  return (
    <div
      className={cn(
        'mkt-wallpaper border-mkt-line rounded-mkt-lg relative overflow-hidden border',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Header strip across the top of a scene: what is being observed on the left,
 * live status on the right.
 */
export function SceneStrip({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="border-mkt-line bg-mkt-paper-raised flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
      {children}
    </div>
  );
}

/**
 * Scene window — the white panel that sits on the wallpaper. Flat by rule
 * (docs/design.md "Flat 2.0"): an opaque surface and a 1px hairline, no
 * glass, no blur, no shadow.
 */
export function Panel({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn('border-mkt-line bg-mkt-surface rounded-mkt-sm border', className)}>
      {children}
    </div>
  );
}

/**
 * Honesty mark for illustrative scenes. Every figure inside a scene is
 * example data, and the deck's second principle ("we never invent a metric to
 * make a screen persuasive") only holds if that is stated where a visitor can
 * actually read it — so this is NOT aria-hidden even when its scene is.
 */
export function ExampleDataNote({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      className={cn(
        'text-mkt-meta text-mkt-ink-muted border-mkt-line bg-mkt-surface rounded-full',
        'inline-flex items-center border px-2.5 py-1 whitespace-nowrap uppercase',
        className,
      )}
    >
      Example data
    </span>
  );
}
