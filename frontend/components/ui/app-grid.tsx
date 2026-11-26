import { createElement, type HTMLAttributes } from 'react';

import { useOnPage } from '@/components/ui/section';
import { cn } from '@/lib/utils';

const LAYOUT = {
  pair: 'column-split:grid-cols-2',
  thirds: 'column-split:grid-cols-3',
  'main-aside': 'column-wide:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
  'aside-main': 'column-wide:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
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
  const gap = useOnPage() ? 'gap-[var(--page-section-gap)]' : 'gap-[var(--panel-inset)]';
  return createElement(
    as,
    {
      ...props,
      'data-app-grid': layout,
      className: cn('grid min-w-0 grid-cols-1 *:min-w-0', gap, LAYOUT[layout], className),
    },
    children,
  );
}
