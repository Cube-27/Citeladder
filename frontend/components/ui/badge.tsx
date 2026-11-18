import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The system's badge tones (Badge README): `neutral` for categories, `accent`
 * for your own brand or "New", `positive` / `negative` / `warning` / `info`
 * for state, `ink` for a count that needs weight. No other tone exists.
 */
export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning' | 'info' | 'ink';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-secondary',
  accent: 'bg-accent-soft text-accent-ink',
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  ink: 'bg-ink text-on-ink',
};

/**
 * The badge face: 22px, 8px padding with a 2px gap (HeroUI's chip), `radius-xs`, 12/16 medium. Centred on
 * the line it sits in: a badge that leads with an icon would otherwise take
 * the icon's bottom edge as its baseline and stretch a 40px table row. It
 * sets its own family and tracking, so a badge inside a figure (a Stat's
 * value) never inherits the figure's tight tracking.
 */
const BADGE_FACE =
  'inline-flex min-h-5.5 max-w-full shrink-0 items-center gap-0.5 rounded-xs px-2 align-middle font-sans text-caption tracking-normal whitespace-nowrap';

export type BadgeProps = {
  children: ReactNode;
  className?: string;
  /** A 6px dot in the badge's ink before the word. */
  dot?: boolean;
  tone?: BadgeTone;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

/**
 * Badge — one or two words of status or category beside a name, on a soft
 * tint with its matching text colour. A neutral badge in a selected table row
 * lifts to `surface` with a `line` edge (the row is `surface-sunken`).
 */
export function Badge({
  children,
  className,
  dot = false,
  tone = 'neutral',
  ...attributes
}: Readonly<BadgeProps>) {
  return (
    <span {...attributes} data-badge-tone={tone} className={cn(BADGE_FACE, TONE[tone], className)}>
      {dot ? <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}
