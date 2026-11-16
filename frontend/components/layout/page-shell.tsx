import { useLocation } from 'react-router-dom';

import { PageFrame } from '@/components/templates/page-frame';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { HeldTabRow } from '@/components/ui/tabs';
import { ShapeBlocks, SkeletonFrame, type LoadingShape } from '@/components/ui/skeleton-block';
import { routeLoading } from '@/lib/navigation/app-routes';
import { cn } from '@/lib/utils';

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
