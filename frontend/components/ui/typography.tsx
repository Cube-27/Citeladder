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
 * Weight encodes exactly one distinction:
 *   500 — things you *scan*: headings, labels, numeric values.
 *   400 — things you *read*: body copy, descriptions, help text, metadata.
 *
 * Hierarchy is carried by size and ink (`foreground` → `secondary` → `muted`),
 * never by weight. These stay class recipes rather than components so the call
 * site keeps whichever element is semantic.
 */
const TEXT_ROLES = {
  /** The top-bar `h1`. 24/500/foreground. */
  pageTitle: 'font-display text-page-title font-medium text-foreground',
  /** A screen section `h2`. 18/500/foreground. */
  sectionTitle: 'font-display text-lg font-medium text-foreground',
  /** A card or object `h3`. 16/500/foreground. */
  objectTitle: 'font-display text-base font-medium text-foreground',
  /** Reading copy — descriptions, prose, table cell text. 14/400/secondary. */
  body: 'text-sm font-normal text-secondary',
  /** Copy that genuinely leads its block. Use sparingly. 14/500/foreground. */
  bodyStrong: 'text-sm font-medium text-foreground',
  /** Timestamps, counts, help text, footnotes. 12/400/muted. */
  meta: 'text-xs font-normal text-muted',
  /** A field or column label. 12/500/secondary. */
  label: 'text-xs font-medium text-secondary',
  /** Uppercase micro-label. The shared recipe, byte-locked by policy. */
  eyebrow: eyebrowClasses,
  /** A primary numeral. 28/500/foreground, tabular. */
  metric: 'font-display text-3xl font-medium tracking-[-0.02em] text-foreground tabular-nums',
  /** A secondary numeral inside a dense row. 16/500/foreground, tabular. */
  metricSm: 'font-display text-base font-medium text-foreground tabular-nums',
  /**
   * A change indicator. Deliberately ink-less: the caller supplies the tone
   * role (`text-success-text`, `text-danger-text`), because the sign of the
   * change is the meaning. 12/400, tabular.
   */
  delta: 'text-xs font-normal tabular-nums',
} as const;

export type TextRole = keyof typeof TEXT_ROLES;

/** Resolve a text role, optionally merged with layout-only classes. */
export function textRole(role: TextRole, className?: string) {
  return cn(TEXT_ROLES[role], className);
}

/**
 * Legacy recipe aliases. These are the same roles under their former names and
 * are kept so the migration can land per directory; prefer `textRole`.
 */
export const pageHeadingClasses = TEXT_ROLES.pageTitle;
export const displayHeadingLgClasses = TEXT_ROLES.sectionTitle;
export const displayHeadingXlClasses = 'font-display text-2xl font-medium text-foreground';

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

/** Uppercase micro-label — the `eyebrow` role. */
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
