import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Status pill. Each tone pairs a dot (the fill hue) with AA-safe label ink —
 * the deck used its raw hues for both, which put "Verified" at 3.7:1 and
 * "Needs review" at 2.8:1. Colour never carries the meaning alone: every
 * badge keeps its text label, so it survives forced-colors and colour
 * blindness.
 */
const TONE = {
  neutral: 'border-mkt-line bg-mkt-paper-raised text-mkt-ink-soft [&>i]:bg-mkt-line-strong',
  proof: 'border-mkt-proof-line bg-mkt-wash text-mkt-proof [&>i]:bg-mkt-proof',
  good: 'border-mkt-evidence-line bg-mkt-evidence-soft text-mkt-evidence-text [&>i]:bg-mkt-evidence',
  warn: 'border-mkt-amber-line bg-mkt-amber-soft text-mkt-amber-text [&>i]:bg-mkt-amber',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: Readonly<{ children: ReactNode; tone?: keyof typeof TONE; className?: string }>) {
  return (
    <span
      className={cn(
        'text-mkt-meta rounded-full inline-flex min-h-6 items-center gap-1.5 border px-2.5 uppercase',
        TONE[tone],
        className,
      )}
    >
      <i className="size-1.5 shrink-0 rounded-full" />
      {children}
    </span>
  );
}

/**
 * The evidence mark — a ticked ring plus a word. Deliberately quieter than a
 * badge: it annotates a claim rather than labelling a row.
 */
export function VerifiedMark({ children = 'Verified' }: Readonly<{ children?: ReactNode }>) {
  return (
    <span className="text-mkt-meta text-mkt-evidence-text inline-flex items-center gap-1.5 uppercase">
      <span
        aria-hidden
        className="border-mkt-evidence-line grid size-4 place-items-center rounded-full border text-2xs leading-none"
      >
        ✓
      </span>
      {children}
    </span>
  );
}
