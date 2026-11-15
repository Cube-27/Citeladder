import { createElement, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * AppGrid — the app's only grids, so a page picks a layout instead of
 * setting columns or gaps. Columns are 24 apart and rows 32, the section gap,
 * so a grid of sections keeps the page's rhythm; items in a row stretch to
 * one height. Sections side by side are divided by a hairline centred in the
 * gap that runs the height of the row; when they stack it goes and each
 * section's ink rule divides them.
 *
 * In the main column the breakpoints are the column's width, so a wider
 * sidebar stacks a grid (`column-split:`/`column-wide:` in globals.css); the
 * px below are the viewport widths they match at the default sidebar.
 * A KPI row is one row from 981px (4 across at the owner's 982px,
 * never 2 × 2, never 2 + 1) and one column on a phone:
 *
 *   `quarters`    — four equal (a KPI row).
 *   `fifths`      — five equal (a five-figure KPI row).
 *   `pair`        — two equal (a two-figure KPI row).
 *   `thirds`      — three equal: one row from 981px, never 2 + 1.
 *   `main-aside`  — 2fr + 1fr (a chart beside a ranked list or facts);
 *                   stacks below 1280px.
 *   `halves`      — two peers (usage and invoices); stack below 1280px.
 *   `table-chart` — 5fr + 4fr: a table of several figure columns beside
 *                   its history chart, so every row keeps its name and the
 *                   chart keeps room for its lines; stacks below 1280px.
 *   `list-detail` — a selectable list beside the selected item's evidence,
 *                   from 981px; the columns align to the top.
 *
 * Grids never nest a second AppGrid and never set widths on their children.
 */
const LAYOUT = {
  quarters:
    'column-split:grid-cols-4 column-split:[&>.surface-section:not(:nth-child(4n+1))]:before:block',
  fifths:
    'column-split:grid-cols-5 column-split:[&>.surface-section:not(:nth-child(5n+1))]:before:block',
  pair: 'column-split:grid-cols-2 column-split:[&>.surface-section:nth-child(2n)]:before:block',
  thirds:
    'column-split:grid-cols-3 column-split:[&>.surface-section:not(:nth-child(3n+1))]:before:block',
  'main-aside':
    'column-wide:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] column-wide:[&>.surface-section:nth-child(2n)]:before:block',
  halves: 'column-wide:grid-cols-2 column-wide:[&>.surface-section:nth-child(2n)]:before:block',
  'table-chart':
    'column-wide:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] column-wide:[&>.surface-section:nth-child(2n)]:before:block',
  'list-detail':
    'column-split:grid-cols-[var(--pane-list-detail)] items-start column-split:[&>.surface-section:nth-child(2n)]:before:block',
} as const;

/** The divider a section beside another draws: hidden until its layout shows it. */
const SECTION_DIVIDER =
  "[&>.surface-section]:relative [&>.surface-section]:before:absolute [&>.surface-section]:before:inset-y-0 [&>.surface-section]:before:-start-3 [&>.surface-section]:before:hidden [&>.surface-section]:before:border-s [&>.surface-section]:before:border-rule [&>.surface-section]:before:content-['']";

export type AppGridLayout = keyof typeof LAYOUT;

type GridElement = 'div' | 'ul' | 'ol' | 'dl' | 'section';

export function AppGrid({
  as = 'div',
  layout,
  className,
  children,
  ...props
}: Readonly<
  HTMLAttributes<HTMLElement> & {
    /** The grid's element, for the list or section it is. */
    as?: GridElement;
    layout: AppGridLayout;
    /** Owner-only: a `components/ui` organism's own extra classes. */
    className?: string;
  }
>) {
  return createElement(
    as,
    {
      ...props,
      'data-app-grid': layout,
      'data-rhythm-gap': '',
      className: cn(
        'grid min-w-0 grid-cols-1 gap-x-[var(--workspace-gap)] gap-y-[var(--page-section-gap)] *:min-w-0 *:[--rhythm-gap:var(--page-section-gap)]',
        SECTION_DIVIDER,
        LAYOUT[layout],
        className,
      ),
    },
    children,
  );
}
