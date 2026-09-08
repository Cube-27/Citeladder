import type { ComponentPropsWithoutRef } from 'react';

import { eyebrowClasses } from '@/components/ui/eyebrow';
import { cn } from '@/lib/utils';

/**
 * The closed set of product text roles.
 *
 * A call site names the *job* the text does and gets its size, weight and ink
 * from that job. It never writes `text-sm font-medium text-foreground` and
 * picks a hierarchy of its own — that is how a card's title, its body copy, its
 * metric and its timestamp all ended up at weight 500, which left weight
 * carrying no information at all.
 *
 * Size, weight, leading, and ink travel together. These stay class recipes so
 * the call site keeps whichever element is semantic.
 */
const TEXT_ROLES = {
  /** The route `h1`. 26/600/foreground. */
  pageTitle: 'font-display text-page-title font-semibold tracking-[-0.65px] text-foreground',
  /** A screen section `h2`. 16/600/foreground. */
  sectionTitle: 'font-display text-base font-semibold tracking-[-0.0125em] text-foreground',
  /** A card or object `h3`. 16/600/foreground. */
  objectTitle: 'font-display text-base font-semibold tracking-[-0.0125em] text-foreground',
  /** Reading copy — descriptions, prose, table cell text. 14/400/ink. */
  body: 'text-sm font-normal text-secondary',
  /** Copy that genuinely leads its block. Use sparingly. 14/500/foreground. */
  bodyStrong: 'text-sm font-medium text-foreground',
  /** Timestamps, counts, help text, footnotes. 12/500/muted. */
  meta: 'text-xs font-medium text-muted',
  /** A field label. 14/500/ink. */
  label: 'text-sm font-medium text-foreground',
  /** Shared metadata label. */
  eyebrow: eyebrowClasses,
  /** A primary numeral. 28/600/foreground, tabular. */
  metric: 'font-display text-3xl font-semibold tracking-[-0.65px] text-foreground tabular-nums',
  /** A secondary numeral inside a dense row. 16/500/foreground, tabular. */
  metricSm: 'font-display text-base font-semibold text-foreground tabular-nums',
  /**
   * A change indicator. Deliberately ink-less: the caller supplies the tone
   * role (`text-success-text`, `text-danger-text`), because the sign of the
   * change is the meaning. 12/400, tabular.
   */
  delta: 'text-xs font-normal tabular-nums',
  /**
   * A value or name inside a row that owns its own size — a label/value pair,
   * a table cell, a list line. Sets weight and ink only, so it never fights the
   * size it inherits. Pass a tone to override the ink.
   */
  emphasis: 'font-medium text-foreground',
} as const;

export type TextRole = keyof typeof TEXT_ROLES;

/** Resolve a text role, optionally merged with layout-only classes. */
export function textRole(role: TextRole, className?: string) {
  return cn(TEXT_ROLES[role], className);
}

/** Section heading (card / block level) — the `objectTitle` role. */
export function SectionTitle({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h2'>>) {
  return (
    <h2 {...props} className={textRole('objectTitle', className)}>
      {children}
    </h2>
  );
}

/** Metadata label — the `eyebrow` role. */
export function Label({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={textRole('eyebrow', className)}>
      {children}
    </span>
  );
}

/** Primary numeral with tabular figures — the `metric` role. */
export function Metric({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={textRole('metric', className)}>
      {children}
    </span>
  );
}
