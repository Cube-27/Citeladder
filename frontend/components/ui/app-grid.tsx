import { createElement, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

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
    as?: GridElement;
    layout: AppGridLayout;
    className?: string;
  }
>) {
  return createElement(
    as,
    {
      ...props,
      'data-app-grid': layout,
      className: cn(
        'grid min-w-0 grid-cols-1 gap-x-[var(--grid-gap-x,var(--workspace-gap))] gap-y-[var(--grid-gap-y,var(--workspace-gap))] *:min-w-0',
        LAYOUT[layout],
        className,
      ),
    },
    children,
  );
}
