import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'info'
  | 'ink'
  | 'selected';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-well text-ink-2',
  accent: 'bg-accent-wash text-accent-text',
  positive: 'bg-positive-wash text-positive',
  negative: 'bg-negative-wash text-negative',
  warning: 'bg-warning-wash text-warning',
  info: 'bg-info-wash text-info',
  ink: 'bg-mark-ink text-on-ink',
  selected: 'bg-state-selected text-ink',
};

const BADGE_FACE =
  'inline-flex min-h-badge max-w-full shrink-0 items-center gap-0.5 rounded-xs px-badge-x align-middle font-sans text-caption whitespace-nowrap';

export type BadgeProps = {
  children: ReactNode;
  className?: string;
  dot?: boolean;
  tone?: BadgeTone;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

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
