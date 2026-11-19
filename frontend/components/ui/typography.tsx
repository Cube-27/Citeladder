import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * The closed set of product text roles.
 *
 * A call site names the *job* the text does and gets face, size, leading,
 * weight and tracking from it. The recipes live once, as `.type-*` classes
 * in `apps/app/src/globals.css`; this map only names them.
 *
 * The sans face speaks (numbers too, in its tabular numerals), mono is only
 * literal machine text, display names the page. Nothing is uppercase. Ink has
 * two steps: `ink` for what is read first and `ink-2` for what supports it
 * (caption and caption-strong default to it). Sizes are 12, 13, 14, 16, 24,
 * 28 and 32 only. Weights are 400 and 500; the app's dark theme draws them
 * at 350 and 450.
 */
const TEXT_ROLES = {
  /** Flow headings, full-page notices. Display 28/36 500. */
  display: 'type-display',
  /** The masthead's page title and the new-chat greeting. Display 20/28 400. */
  title: 'type-title',
  /** Card, section, dialog and drawer titles. Sans 16/24 500. */
  heading: 'type-heading',
  /** Group heads inside a card, widget titles, field-group legends. Sans 14/20 500. */
  subheading: 'type-subheading',
  /** Default interface text, table cells, stat labels. Sans 14/20 400. */
  body: 'type-body',
  /** Buttons, tabs, navigation, field labels, the selected item. Sans 14/20 500. */
  label: 'type-label',
  /** Reading text: Agent replies, documents, long explanations. Sans 16/26. */
  prose: 'type-prose',
  /** Help text, metadata, the basis under a figure. Sans 12/16, `ink-2`. */
  caption: 'type-caption',
  /** Column heads, group labels, tags, the "Draft" marker. Sans 12/16 500, sentence case, `ink-2`. */
  captionStrong: 'type-caption-strong',
  /** At most one hero figure per page. Sans 32/40 500, tabular. */
  figureXl: 'type-figure-xl',
  /** Every metric figure in the app. Sans 20/28 500, tabular. */
  figure: 'type-figure',
  /** Code, ids, keys, raw snippets, keyboard hints. Mono 13/20. */
  code: 'type-code',
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
 * command): the `code` role in a well, 8 across and 4 down, the control
 * radius, cut to one line. One form; the token owns its box.
 */
export function CodeToken({ children }: Readonly<{ children: string }>) {
  return (
    <code
      data-code-token=""
      className={textRole('code', 'bg-well min-w-0 truncate rounded-control px-2 py-1')}
    >
      {children}
    </code>
  );
}

/**
 * InlineFigure — a number inside a line that keeps the line's face, size and
 * ink (a tab or chip count, a total, "30 / 210") in tabular numerals (law 2).
 */
export function InlineFigure({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={cn('tabular-nums', className)}>
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
