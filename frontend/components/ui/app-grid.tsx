import { createElement, type HTMLAttributes } from 'react';

import { useOnPage } from '@/components/ui/section';
import { cn } from '@/lib/utils';

const LAYOUT = {
  pair: 'column-split:grid-cols-2 items-start',
  thirds: 'column-split:grid-cols-3 items-start',
  'main-aside': 'column-wide:grid-cols-main-aside items-start',
  'aside-main': 'column-wide:grid-cols-aside-main items-start',
  halves: 'column-wide:grid-cols-2 items-start',
  slips: 'grid-cols-cards',
} as const;

export type AppGridLayout = keyof typeof LAYOUT;

type GridElement = 'div' | 'ul' | 'ol' | 'dl' | 'section';

export function AppGrid({
  as = 'div',
  layout,
  children,
  ...props
}: Readonly<
  Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & {
    as?: GridElement;
    layout: AppGridLayout;
  }
>) {
  const gap = useOnPage() ? 'gap-section' : 'gap-panel-inset';
  return createElement(
    as,
    {
      ...props,
      'data-app-grid': layout,
      className: cn('grid min-w-0 grid-cols-1 *:min-w-0', gap, LAYOUT[layout]),
    },
    children,
  );
}
