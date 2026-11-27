import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { OverviewLoading } from '@/components/projects/overview-loading';
import { IssuesPageLoading } from '@/components/site-health/issues-summary-loading';
import { PageFrame } from '@/components/templates/page-frame';
import { ReportPage } from '@/components/templates/report-page';
import { NewChatLoading, ThreadPageLoading } from '@/components/templates/thread-page';
import type { FilterBarProps } from '@/components/ui/filter-bar';
import { Stack } from '@/components/ui/layout';
import { TextLineSkeleton } from '@/components/ui/loading-parts';
import { RailColumns } from '@/components/ui/page-chrome';
import { HeldTabRail, HeldTabRow } from '@/components/ui/tabs';
import { ShapeBlocks, SkeletonFrame, type LoadingShape } from '@/components/ui/skeleton-block';
import { Section, SectionBleed } from '@/components/ui/section';
import { routeLoading } from '@/lib/navigation/app-routes';
import type { HeldTabs, RouteLoading } from '@/lib/navigation/route-types';

export const RESERVED_CONTROLS: FilterBarProps = {};

export function RouteLoadingScreen() {
  const location = useLocation();
  const loading = routeLoading(location.pathname);
  switch (loading.kind) {
    case 'overview':
      return (
        <ReportPage>
          <OverviewLoading />
        </ReportPage>
      );
    case 'issues':
      return (
        <ReportPage>
          <IssuesPageLoading />
        </ReportPage>
      );
    case 'thread':
      return <ThreadPageLoading />;
    case 'new-chat':
      return <NewChatLoading />;
    case 'cards': {
      const skeleton = (
        <SkeletonFrame
          label="Loading…"
          variant="route"
          layout={loading.stacked ? 'workspace' : 'section'}
        >
          {loading.intro ? (
            <Stack as="span" gap="tight" data-loading-shape="intro">
              <TextLineSkeleton text="heading" width="long" />
              <TextLineSkeleton text="body" width="long" />
            </Stack>
          ) : null}
          {loading.shapes.map((shape, index) => (
            <ShapeBox key={index} shape={shape} />
          ))}
        </SkeletonFrame>
      );
      return (
        <PageFrame
          tabs={
            loading.tabs ? <RouteTabs tabs={loading.tabs} search={location.search} /> : undefined
          }
          filters={loading.filters ? RESERVED_CONTROLS : undefined}
        >
          {loading.rail ? (
            <RouteRail rail={loading.rail} search={location.search}>
              {skeleton}
            </RouteRail>
          ) : (
            skeleton
          )}
        </PageFrame>
      );
    }
    default: {
      const exhaustive: never = loading;
      return exhaustive;
    }
  }
}

function RouteRail({
  rail,
  search,
  children,
}: Readonly<{
  rail: NonNullable<Extract<RouteLoading, { kind: 'cards' }>['rail']>;
  search: string;
  children: ReactNode;
}>) {
  const value = new URLSearchParams(search).get(rail.param);
  const current = rail.items.find((item) => item.value === value) ?? rail.items[0];
  return (
    <RailColumns
      rail={<HeldTabRail labels={rail.items.map((item) => item.label)} selected={current?.label} />}
      section={current?.value === rail.fillTab ? 'fill' : 'reading'}
    >
      {children}
    </RailColumns>
  );
}

function RouteTabs({ tabs, search }: Readonly<{ tabs: HeldTabs; search: string }>) {
  const value = new URLSearchParams(search).get(tabs.param);
  return (
    <HeldTabRow
      labels={tabs.items.map((item) => item.label)}
      selected={tabs.items.find((item) => item.value === value)?.label}
    />
  );
}

function ShapeBox({ shape }: Readonly<{ shape: LoadingShape }>) {
  const blocks = <ShapeBlocks shape={shape} />;
  switch (shape.kind) {
    case 'thread':
      return (
        <div data-loading-shape={shape.kind} className="min-w-0">
          {blocks}
        </div>
      );
    case 'table':
      return <SectionBleed data-loading-shape={shape.kind}>{blocks}</SectionBleed>;
    case 'figures':
    case 'facts':
    case 'list':
    case 'chart':
      return <Section data-loading-shape={shape.kind}>{blocks}</Section>;
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}
