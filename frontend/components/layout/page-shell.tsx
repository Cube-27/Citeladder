import type { ReactNode } from 'react';

import { PageFrame, PageSections } from '@/components/templates/page-frame';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { TabRow, type TabRowProps } from '@/components/ui/tabs';
import { ShapeBlocks, SkeletonFrame } from '@/components/ui/skeleton-block';

/**
 * The screens not yet moved onto a template (components/templates) draw
 * through these, on the same frame: the masthead, the page tabs band, the
 * filter bar band, then the content 24 below. A route passes data, organisms
 * and slots and adds no margins between bands.
 */
type ScreenBands<T extends string> = Readonly<{
  /** Overrides the route-derived title (a record's own name). */
  title?: string;
  /** Route-owned controls; their state and outcomes stay with the route owner. */
  actions?: ReactNode;
  /** The route's tabs, drawn as the `TabRow`; the route owns the `TabsRoot`. */
  tabs?: TabRowProps<T>;
  /** The selected tab's control row, drawn as the `FilterBar`. */
  controls?: FilterBarProps;
  children?: ReactNode;
}>;

/** ListScreen — a collection, dashboard or workspace route. */
export function ListScreen<T extends string = string>({
  title,
  actions,
  tabs,
  controls,
  children,
}: ScreenBands<T>) {
  return (
    <PageFrame
      title={title}
      actions={actions}
      tabs={tabs ? <TabRow {...tabs} /> : undefined}
      filters={controls ? <FilterBar {...controls} /> : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <PageSections>{children}</PageSections>
      </div>
    </PageFrame>
  );
}

/**
 * The control band, held while the route's filters wait on their first read.
 * A loading frame passes it as `controls` when the loaded page will have a
 * control band, so the work below starts on the same line in both frames.
 */
export const RESERVED_CONTROLS: FilterBarProps = {};

/**
 * RouteLoadingScreen — the frame a route shows before its own page can draw:
 * the masthead (its title comes from the path) and the Report shape where the
 * content begins: a row of three figures over one chart-height card.
 */
export function RouteLoadingScreen({ label }: Readonly<{ label?: string }>) {
  return (
    <ListScreen>
      <SkeletonFrame label={label ?? 'Loading…'} variant="report" className="grid gap-4">
        <ShapeBlocks shape={{ kind: 'figures', count: 3 }} />
        <div data-state-frame="" className="h-60">
          <ShapeBlocks shape={{ kind: 'card' }} />
        </div>
      </SkeletonFrame>
    </ListScreen>
  );
}
