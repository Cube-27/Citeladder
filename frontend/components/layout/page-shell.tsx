import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { PageFrame, PageSections } from '@/components/templates/page-frame';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { HeldTabRow, TabRow, type TabRowProps } from '@/components/ui/tabs';
import { ShapeBlocks, SkeletonFrame, type LoadingShape } from '@/components/ui/skeleton-block';
import { routeLoading } from '@/lib/navigation/app-routes';
import { cn } from '@/lib/utils';

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
 * RouteLoadingScreen — the frame a route shows before its own page can draw,
 * from its manifest entry (`routeLoading`): the masthead titled from the path,
 * the route's real tab labels and held filter row, then its first screen's
 * shapes on cards, so the page arrives without moving them.
 */
export function RouteLoadingScreen() {
  const { tabs, filters, shapes } = routeLoading(useLocation().pathname);
  return (
    <PageFrame
      tabs={tabs ? <HeldTabRow labels={tabs} /> : undefined}
      filters={filters ? <FilterBar {...RESERVED_CONTROLS} /> : undefined}
    >
      <SkeletonFrame
        label="Loading…"
        variant="route"
        className="flex flex-col gap-[var(--workspace-gap)]"
      >
        {shapes.map((shape, index) => (
          <ShapeCard key={index} shape={shape} />
        ))}
      </SkeletonFrame>
    </PageFrame>
  );
}

const CARD = 'bg-surface border-rule rounded-card shadow-card min-w-0 border';

/** A shape on its card; figures are their own cards, and a thread sits on the page. */
function ShapeCard({ shape }: Readonly<{ shape: LoadingShape }>) {
  const blocks = <ShapeBlocks shape={shape} />;
  switch (shape.kind) {
    case 'figures':
    case 'thread':
      return <div data-loading-shape={shape.kind}>{blocks}</div>;
    case 'table':
      return (
        <div data-loading-shape={shape.kind} className={cn(CARD, 'overflow-hidden')}>
          {blocks}
        </div>
      );
    case 'card':
    case 'chart':
      return (
        <div data-loading-shape={shape.kind} className={cn(CARD, 'p-[var(--card-padding)]')}>
          {blocks}
        </div>
      );
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}
