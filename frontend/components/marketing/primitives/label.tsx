import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The "meta" role. The deck called this mono, but the system has no mono
 * face — what actually distinguishes these labels is that they are small,
 * upper-cased, tracked out and tabular. Codifying it as a style (rather than
 * pretending Inter is a monospace) is why every label on the surface matches.
 */
export function Meta({
  children,
  className,
  as: Tag = 'span',
}: Readonly<{ children: ReactNode; className?: string; as?: 'span' | 'p' | 'div' }>) {
  return (
    <Tag className={cn('text-mkt-meta text-mkt-ink-muted mkt-num uppercase', className)}>
      {children}
    </Tag>
  );
}

/**
 * Section opener: a proof-blue dot with a halo, then the label. The dot is
 * the only decorative use of the accent on paper — everywhere else colour
 * has to mean a state.
 */
export function Eyebrow({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <span
      className={cn(
        'text-mkt-meta text-mkt-ink-soft inline-flex items-center gap-2.5 font-medium uppercase',
        className,
      )}
    >
      <span className="bg-mkt-proof ring-mkt-proof-soft size-1.5 shrink-0 rounded-full ring-5" />
      {children}
    </span>
  );
}

/**
 * "Evidence capture active" — a live indicator with a slow pulse. Used only
 * where something genuinely is running in the depicted scene.
 */
export function LiveDot({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="text-mkt-meta text-mkt-slate mkt-num inline-flex items-center gap-2 uppercase">
      <span className="bg-mkt-evidence animate-mkt-pulse size-1.5 shrink-0 rounded-full" />
      {children}
    </span>
  );
}
