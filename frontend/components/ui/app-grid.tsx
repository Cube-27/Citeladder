import { createElement, type HTMLAttributes } from 'react';

import { useOnPage } from '@/components/ui/section';
import { cn } from '@/lib/utils';

const LAYOUT = {
  pair: 'column-split:grid-cols-2',
  thirds: 'column-split:grid-cols-3',
  'main-aside': 'column-wide:grid-cols-main-aside',
  'aside-main': 'column-wide:grid-cols-aside-main',
  halves: 'column-wide:grid-cols-2',
  slips: 'grid-cols-cards',
} as const;

export type AppGridLayout = keyof typeof LAYOUT;

type GridElement = 'div' | 'ul' | 'ol' | 'dl' | 'section';

export function AppGrid({
  as = 'div',
  layout,
  alignTop = false,
  children,
  ...props
}: Readonly<
  Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & {
    as?: GridElement;
    layout: AppGridLayout;
    alignTop?: boolean;
  }
>) {
  const gap = useOnPage() ? 'gap-section' : 'gap-panel-inset';
  return createElement(
    as,
    {
      ...props,
      'data-app-grid': layout,
      className: cn(
        'grid min-w-0 grid-cols-1 *:min-w-0',
        gap,
        LAYOUT[layout],
        alignTop && 'items-start',
      ),
    },
    children,
  );
}
