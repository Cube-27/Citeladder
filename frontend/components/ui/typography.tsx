import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * The closed set of product text roles.
 *
 * A call site names the *job* the text does and gets size, leading, weight,
 * tracking and ink from that job. The recipes live once, as `.type-*` classes
 * in `apps/app/src/globals.css`; this map only names them, so retuning a role
 * is one CSS edit and no call site changes.
 *
 * Weights carry hierarchy with size: 400 for sentences, 500 for labels and
 * controls, 600 for titles and figures. Ink steps from `foreground` (what the
 * reader came for) through `secondary` (sentences) to `muted` (labels, meta).
 */
const TEXT_ROLES = {
  /** The route `h1`. 24/32, 600, foreground, display face. One per page. */
  pageTitle: 'type-page-title',
  /** A section, card, drawer or dialog heading. 16/24, 600, foreground. */
  sectionTitle: 'type-section-title',
  /** The title of a row, list item or insight. 14/20, 600, foreground. */
  itemTitle: 'type-item-title',
  /** Sentences: descriptions, prose, table cell text. 14/20, 400, secondary. */
  body: 'type-body',
  /** Buttons, navigation, tabs, links. 14/20, 500; ink comes from state. */
  control: 'type-control',
  /** Names a value: metric, field and column labels. 13/18, 500, muted. */
  label: 'type-label',
  /** Timestamps, counts, help, footnotes. 12/16, 400, muted. */
  caption: 'type-caption',
  /** A metric value. 24/32, 600, foreground, tabular. */
  figure: 'type-figure',
  /** A value inside a dense row or cell. 16/24, 600, foreground, tabular. */
  figureSm: 'type-figure-sm',
  /** A change indicator. 12/16, 500, tabular; the caller supplies the tone. */
  delta: 'type-delta',
  /** Badges, chips, counts, key hints. 12/16, 500; the tone supplies the ink. */
  badge: 'type-badge',
  /** A value or name inside text that owns its size: 500, foreground. */
  emphasis: 'type-emphasis',
} as const;

export type TextRole = keyof typeof TEXT_ROLES;

/** Resolve a text role, optionally merged with layout-only classes. */
export function textRole(role: TextRole, className?: string) {
  return cn(TEXT_ROLES[role], className);
}

/** Section heading (card / block level) — the `sectionTitle` role. */
export function SectionTitle({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'h2'>>) {
  return (
    <h2 {...props} className={textRole('sectionTitle', className)}>
      {children}
    </h2>
  );
}

/** A label naming a value — the `label` role. */
export function Label({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={textRole('label', className)}>
      {children}
    </span>
  );
}

/** Primary numeral with tabular figures — the `figure` role. */
export function Metric({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={textRole('figure', className)}>
      {children}
    </span>
  );
}
