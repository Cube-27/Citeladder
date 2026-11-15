import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * The closed set of product text roles (brand direction 2.1).
 *
 * A call site names the *job* the text does and gets face, size, leading,
 * weight and tracking from it. The recipes live once, as `.type-*` classes
 * in `apps/app/src/globals.css`; this map only names them.
 *
 * Mono is measured, sans is said, display names places. Ink has two steps:
 * `ink` for what is read first (every role's default) and `ink-2` for what
 * supports it (caption and overline default to it; pass `text-ink-2` for a
 * supporting sentence at body size). Sizes are 12, 13, 14, 16, 20, 24, 28
 * and 40 only.
 */
const TEXT_ROLES = {
  /** Flow headings, the new-chat greeting, full-page notices. Display 28/36 500. */
  display: 'type-display',
  /** The masthead's page title; dialog and drawer titles. Display 20/28 600. One per view. */
  title: 'type-title',
  /** A section title. Sans 16/24 600. */
  heading: 'type-heading',
  /** Slip titles, table group heads, field-group legends. Sans 14/20 600. */
  subheading: 'type-subheading',
  /** Default interface text and table text cells. Sans 14/20 400. */
  body: 'type-body',
  /** Buttons, tabs, navigation, field labels, the selected item. Sans 14/20 500. */
  label: 'type-label',
  /** Reading text: Agent replies, documents, long explanations. Sans 16/26, 60–80ch. */
  prose: 'type-prose',
  /** Help text and metadata sentences. Sans 12/16, `ink-2`. */
  caption: 'type-caption',
  /** Column heads, navigation group heads, key-figure labels, DRAFT. Mono 12/16 500 caps. */
  overline: 'type-overline',
  /** At most one hero figure per page. Mono 40/44 500. */
  figureXl: 'type-figure-xl',
  /** A key figure. Mono 24/32 500. */
  figure: 'type-figure',
  /** Table numerals, dates, URLs, ids, code. Mono 13/20. */
  data: 'type-data',
  /** Changes, citation markers, counts, key hints, absence words. Mono 12/16. */
  dataSm: 'type-data-sm',
  /** Emphasis inside text: weight 500, never colour. */
  emphasis: 'type-emphasis',
  /** The website's product screens only (components/marketing/screens); the app uses `title`. */
  pageTitle: 'type-page-title',
} as const;

export type TextRole = keyof typeof TEXT_ROLES;

/** Resolve a text role, optionally merged with layout-only classes. */
export function textRole(role: TextRole, className?: string) {
  return cn(TEXT_ROLES[role], className);
}

/** A supporting label naming a value: `body` in `ink-2`. */
export function Label({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={textRole('body', cn('text-ink-2', className))}>
      {children}
    </span>
  );
}

/**
 * CodeToken — a literal the reader copies or types (a URL, a key prefix, a
 * command): the `data` role in a well, 8 across and 4 down, the control
 * radius, cut to one line. One form; the token owns its box.
 */
export function CodeToken({ children }: Readonly<{ children: string }>) {
  return (
    <code
      data-code-token=""
      className={textRole('data', 'bg-well min-w-0 truncate rounded-control px-2 py-1')}
    >
      {children}
    </code>
  );
}

/**
 * InlineFigure — a number inside a line that keeps the line's size and ink
 * (a tab or chip count, a total, an ID, "30 / 210"): only the digits take the
 * mono face, so numerals are tabular by construction (law 2).
 */
export function InlineFigure({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={cn('font-mono tabular-nums', className)}>
      {children}
    </span>
  );
}

/** A key figure's numeral — the `figure` role. */
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
