import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Badge / pill label (docs/website-design-system.md §5.4).
 *
 * Semantic tones pair the MARK hue on the border and dot with the AA-safe
 * `-text` sibling on the label — the split exists because a hue that works as
 * a fill is not automatically legible as text (§1). Every badge keeps its text
 * label, so meaning survives forced-colors and colour blindness.
 *
 * `proof` / `good` / `warn` are retained aliases for the semantic names, so
 * existing call sites keep working without a sweep.
 */
const TONE = {
  neutral: 'bg-mkt-frost border-mkt-black-10 text-mkt-ink-soft [&>i]:bg-mkt-silver',
  accent: 'bg-mkt-frost border-mkt-primary/30 text-mkt-indigo [&>i]:bg-mkt-primary',
  success: 'bg-mkt-success-10 border-mkt-success/30 text-mkt-success-text [&>i]:bg-mkt-success',
  warning: 'bg-mkt-warning/10 border-mkt-warning/30 text-mkt-warning-text [&>i]:bg-mkt-warning',
  error: 'bg-mkt-error-05 border-mkt-error/30 text-mkt-error-text [&>i]:bg-mkt-error',
} as const;

const ALIAS = {
  proof: 'accent',
  good: 'success',
  warn: 'warning',
} as const;

type Tone = keyof typeof TONE | keyof typeof ALIAS;

export function Badge({
  children,
  tone = 'neutral',
  dot = true,
  className,
}: Readonly<{
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}>) {
  const resolved = tone in ALIAS ? ALIAS[tone as keyof typeof ALIAS] : (tone as keyof typeof TONE);
  return (
    <span
      className={cn(
        'rounded-mkt-pill gap-mkt-6 px-mkt-14 py-mkt-6 text-mkt-xsb inline-flex items-center border',
        TONE[resolved],
        className,
      )}
    >
      {dot && <i className="size-mkt-6 shrink-0 rounded-full" />}
      {children}
    </span>
  );
}
