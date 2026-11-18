import { createElement, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * AppGrid — the app's only grids, so a page picks a layout instead of
 * setting columns or gaps. Cards are 16 apart in both directions and the
 * cards in one row share a height (they stretch); side by side they are
 * separated by the gap and their own edges, never a rule. Sections on the
 * page are 32 either side of a rule instead.
 *
 * In the main column the breakpoints are the column's width, so a wider
 * sidebar stacks a grid (`column-split:`/`column-wide:` in globals.css); the
 * px below are the viewport widths they match at the default sidebar.
 * A KPI row is one row from 981px (never 2 × 2, never 2 + 1) and one
 * column on a phone:
 *
 *   `pair`      — two equal (a two-figure KPI row).
 *   `thirds`      — three equal: one row from 981px, never 2 + 1.
 *   `main-aside`  — 2fr + 1fr (a chart beside a ranked list or facts);
 *                   stacks below 1280px.
 *   `halves`      — two peers (usage and invoices); stack below 1280px.
 *   `slips`       — as many slips as fit, each at least 280 (two at 982).
 *
 * Grids never nest a second AppGrid and never set widths on their children.
 */
const LAYOUT = {
  pair: 'column-split:grid-cols-2',
  thirds: 'column-split:grid-cols-3',
  'main-aside': 'column-wide:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
  halves: 'column-wide:grid-cols-2',
  slips: 'grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]',
} as const;

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
      className: cn(
        // A grid of page sections widens its gaps for its rules (globals.css, "Section dividers").
        'grid min-w-0 grid-cols-1 gap-x-[var(--grid-gap-x,var(--workspace-gap))] gap-y-[var(--grid-gap-y,var(--workspace-gap))] *:min-w-0',
        LAYOUT[layout],
        className,
      ),
    },
    children,
  );
}
