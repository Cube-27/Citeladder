import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The hero's on-load entrance — a CSS beat stagger over the hero type column's
 * direct children (eyebrow, headline, lead, CTA), so the sequence follows the
 * markup instead of duplicating its structure. The keyframes and per-beat
 * delays live in `globals.css` (`hero-entrance`); the animation is purely
 * additive over content that is already server-rendered in its settled state,
 * and the global reduced-motion rule collapses it to nothing.
 */
export function HeroEntrance({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return <div className={cn('hero-entrance', className)}>{children}</div>;
}
