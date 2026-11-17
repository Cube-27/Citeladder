import { useLocation } from 'react-router-dom';

import { OverviewLoading } from '@/components/projects/overview-loading';
import { PageFrame } from '@/components/templates/page-frame';
import { ReportPage } from '@/components/templates/report-page';
import { NewChatLoading, ThreadPageLoading } from '@/components/templates/thread-page';
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
 * shapes on cards; the Overview's widget grid, a chat and a new chat in their
 * own templates. The page arrives without moving them.
 */
export function RouteLoadingScreen() {
  const loading = routeLoading(useLocation().pathname);
  switch (loading.kind) {
    case 'overview':
      return (
        <ReportPage>
          <OverviewLoading />
        </ReportPage>
      );
    case 'thread':
      return <ThreadPageLoading />;
    case 'new-chat':
      return <NewChatLoading />;
    case 'cards':
      return (
        <PageFrame
          tabs={loading.tabs ? <HeldTabRow labels={loading.tabs} /> : undefined}
          filters={loading.filters ? <FilterBar {...RESERVED_CONTROLS} /> : undefined}
        >
          <SkeletonFrame
            label="Loading…"
            variant="route"
            className="flex flex-col gap-[var(--workspace-gap)]"
          >
            {loading.shapes.map((shape, index) => (
              <ShapeCard key={index} shape={shape} />
            ))}
          </SkeletonFrame>
        </PageFrame>
      );
    default: {
      const exhaustive: never = loading;
      return exhaustive;
    }
  }
}

const CARD = 'bg-surface rounded-card shadow-card min-w-0';

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
    case 'chart':
    case 'facts':
    case 'list':
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
