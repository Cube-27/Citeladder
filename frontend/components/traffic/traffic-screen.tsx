'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { TrafficEmptyState } from '@/components/traffic/empty-state';
import { PagesTable } from '@/components/traffic/pages-table';
import { QueriesTable } from '@/components/traffic/queries-table';
import { TrafficToolbar } from '@/components/traffic/traffic-toolbar';
import { UnifiedPerformanceCard } from '@/components/traffic/unified-performance-card';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { integrationsApi } from '@/lib/api/integrations';
import { queryKeys } from '@/lib/api/query-keys';
import { retainPreviousDataForScope } from '@/lib/api/query-client';
import { trafficApi, type TrafficDashboard } from '@/lib/api/traffic';
import { useProjectContext } from '@/lib/project/project-context';
import {
  formatSyncTimestamp,
  formatWindowDate,
  isEmptyDashboard,
  rangeToWindow,
  type TrafficGranularity,
  type TrafficRange,
} from '@/lib/traffic/traffic';

import { useTrafficSync } from './use-traffic-sync';

const TRAFFIC_TABLE_TABS = [
  { id: 'pages', label: 'Top pages' },
  { id: 'queries', label: 'Top queries' },
] as const;
type TrafficTableView = (typeof TRAFFIC_TABLE_TABS)[number]['id'];

type DashboardQuery = ReturnType<typeof useQuery<TrafficDashboard>>;
type ConnectionsQuery = ReturnType<
  typeof useQuery<Awaited<ReturnType<typeof integrationsApi.list>>>
>;

function TrafficSkeleton() {
  return (
    <div
      className="grid gap-[var(--workspace-gap)]"
      aria-busy="true"
      data-testid="traffic-skeleton"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-26" />
        ))}
      </div>
      <div className="grid gap-[var(--workspace-gap)] xl:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

/** Coordinates project-scoped data; rendering lives in cohesive dashboard sections. */
export function TrafficScreen() {
  const { activeProject, isLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const workspaceId = activeProject?.workspace_id ?? null;
  const [range, setRange] = useState<TrafficRange>('latest');
  const [granularity, setGranularity] = useState<TrafficGranularity>('day');
  const bounds = rangeToWindow(range);
  const dashboard = useQuery({
    queryKey: queryKeys.traffic.dashboard(projectId ?? '', { ...bounds, granularity }),
    queryFn: ({ signal }) =>
      trafficApi.getTraffic(projectId ?? '', { ...bounds, granularity }, { signal }),
    enabled: Boolean(projectId),
    placeholderData: (previousData, previousQuery) =>
      retainPreviousDataForScope(projectId!, previousData, previousQuery),
  });
  const connections = useQuery({
    queryKey: queryKeys.integrations.connections(workspaceId),
    queryFn: ({ signal }) => integrationsApi.list({ signal }),
    enabled: Boolean(workspaceId),
  });
  const sync = useTrafficSync(projectId);
  const lastSynced = latestSync(connections.data ?? []);
  const note = projectId ? syncNote(sync.syncing, sync.startedAt, lastSynced) : 'Select a project';

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <TrafficToolbar
        range={range}
        onChangeRange={setRange}
        granularity={granularity}
        onChangeGranularity={setGranularity}
        note={note}
        syncing={sync.syncing}
        syncPending={sync.mutation.isPending}
        fetching={dashboard.isFetching}
        syncDisabled={!projectId || !connections.data?.length}
        onSyncNow={() => sync.mutation.mutate()}
      />
      <TrafficDataGate
        isProjectLoading={isLoading}
        projectId={projectId}
        dashboard={dashboard}
        connections={connections}
        range={range}
        sync={sync}
      />
    </div>
  );
}

function TrafficDataGate({
  isProjectLoading,
  projectId,
  dashboard,
  connections,
  range,
  sync,
}: Readonly<{
  isProjectLoading: boolean;
  projectId: string | null;
  dashboard: DashboardQuery;
  connections: ConnectionsQuery;
  range: TrafficRange;
  sync: ReturnType<typeof useTrafficSync>;
}>) {
  if (isProjectLoading || (Boolean(projectId) && dashboard.isLoading)) return <TrafficSkeleton />;
  if (!projectId) return <Alert tone="info">Select or create a project to see its traffic.</Alert>;
  if (dashboard.isError)
    return (
      <Alert tone="danger">Could not load traffic data. Check your connection and try again.</Alert>
    );
  return (
    <TrafficDashboard
      projectId={projectId}
      dashboard={dashboard.data as TrafficDashboard}
      dashboardFetching={dashboard.isFetching}
      connections={connections.data ?? []}
      range={range}
      sync={sync}
    />
  );
}

function TrafficDashboard({
  projectId,
  dashboard,
  dashboardFetching,
  connections,
  range,
  sync,
}: Readonly<{
  projectId: string;
  dashboard: TrafficDashboard;
  dashboardFetching: boolean;
  connections: Awaited<ReturnType<typeof integrationsApi.list>>;
  range: TrafficRange;
  sync: ReturnType<typeof useTrafficSync>;
}>) {
  if (isEmptyDashboard(dashboard))
    return <EmptyTrafficDashboard range={range} connections={connections} sync={sync} />;
  return (
    <PopulatedTrafficDashboard
      projectId={projectId}
      dashboard={dashboard}
      dashboardFetching={dashboardFetching}
      range={range}
      sync={sync}
    />
  );
}

function EmptyTrafficDashboard({
  range,
  connections,
  sync,
}: Readonly<{
  range: TrafficRange;
  connections: Awaited<ReturnType<typeof integrationsApi.list>>;
  sync: ReturnType<typeof useTrafficSync>;
}>) {
  // Both dates describe the same persisted snapshot window.
  const bounds = rangeToWindow(range);
  if (range !== 'latest')
    return (
      <div className="grid gap-[var(--workspace-gap)]">
        <SyncBanner active={sync.syncing} />
        <Alert tone="info">
          No synced snapshot covers {formatWindowDate(bounds.from ?? '')} –{' '}
          {formatWindowDate(bounds.to ?? '')} yet. Traffic serves persisted sync windows only —
          switch to the latest synced window or run a sync.
        </Alert>
      </div>
    );
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <SyncBanner active={sync.syncing} />
      <TrafficAlerts sync={sync} includeSuccess={false} />
      <TrafficEmptyState
        hasConnections={connections.length > 0}
        syncing={sync.syncing || sync.mutation.isPending}
        onSyncNow={() => sync.mutation.mutate()}
        showSyncAction={false}
      />
    </div>
  );
}

function PopulatedTrafficDashboard({
  projectId,
  dashboard,
  dashboardFetching,
  range,
  sync,
}: Readonly<{
  projectId: string;
  dashboard: TrafficDashboard;
  dashboardFetching: boolean;
  range: TrafficRange;
  sync: ReturnType<typeof useTrafficSync>;
}>) {
  const queryClient = useQueryClient();
  const [tableView, setTableView] = useState<TrafficTableView>('pages');
  const [mountedViews, setMountedViews] = useState<ReadonlySet<TrafficTableView>>(
    () => new Set<TrafficTableView>(['pages']),
  );
  const bounds = rangeToWindow(range);
  // Retain the current context project id while React Query shows previous data
  // during a project switch; placeholder dashboard data may belong to the old project.
  const tableKey = `${bounds.from ?? ''}|${bounds.to ?? ''}`;
  const prepareTable = (view: TrafficTableView) => {
    setMountedViews((current) => (current.has(view) ? current : new Set(current).add(view)));
    const params = { from: bounds.from, to: bounds.to, sort: '-clicks' };
    if (view === 'pages') {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.traffic.pages(projectId, { ...params, cursor: undefined }),
        queryFn: ({ signal }) => trafficApi.getPages(projectId, params, { signal }),
      });
    } else {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.traffic.queries(projectId, { ...params, cursor: undefined }),
        queryFn: ({ signal }) => trafficApi.getQueries(projectId, params, { signal }),
      });
    }
  };
  const selectTable = (view: TrafficTableView) => {
    prepareTable(view);
    setTableView(view);
  };
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <SyncBanner active={sync.syncing} />
      <TrafficAlerts sync={sync} />
      <div aria-busy={dashboardFetching} className="grid gap-[var(--workspace-gap)]">
        <UnifiedPerformanceCard dashboard={dashboard} granularity={dashboard.granularity} />
        <Tabs
          value={tableView}
          onValueChange={selectTable}
          items={TRAFFIC_TABLE_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
          ariaLabel="Traffic rankings"
          rootClassName="grid gap-4"
          onIntent={prepareTable}
        >
          {mountedViews.has('pages') ? (
            <TabPanel value="pages" forceMount className="focus-ring">
              <TrafficRankings
                projectId={projectId}
                tableView="pages"
                tableKey={tableKey}
                from={bounds.from}
                to={bounds.to}
              />
            </TabPanel>
          ) : null}
          {mountedViews.has('queries') ? (
            <TabPanel value="queries" forceMount className="focus-ring">
              <TrafficRankings
                projectId={projectId}
                tableView="queries"
                tableKey={tableKey}
                from={bounds.from}
                to={bounds.to}
              />
            </TabPanel>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}

function TrafficRankings({
  projectId,
  tableView,
  tableKey,
  from,
  to,
}: Readonly<{
  projectId: string;
  tableView: TrafficTableView;
  tableKey: string;
  from: string | undefined;
  to: string | undefined;
}>) {
  return (
    <div className="grid gap-3">
      <p className="text-muted text-xs">
        Rankings use totals for the selected date range. Chart interval does not change their order.
      </p>
      {tableView === 'pages' ? (
        <PagesTable key={`pages-${tableKey}`} projectId={projectId} from={from} to={to} />
      ) : (
        <QueriesTable key={`queries-${tableKey}`} projectId={projectId} from={from} to={to} />
      )}
    </div>
  );
}

function latestSync(connections: Awaited<ReturnType<typeof integrationsApi.list>>) {
  return connections.reduce<string | null>(
    (latest, connection) =>
      !connection.last_synced_at || (latest && connection.last_synced_at <= latest)
        ? latest
        : connection.last_synced_at,
    null,
  );
}
function syncNote(syncing: boolean, startedAt: string | null, lastSynced: string | null) {
  if (syncing && startedAt) return `Started ${formatSyncTimestamp(startedAt)}`;
  return lastSynced ? `Last synced ${formatSyncTimestamp(lastSynced)}` : 'Never synced';
}
function SyncBanner({ active }: Readonly<{ active: boolean }>) {
  return active ? (
    <Alert tone="info" hideIcon>
      <span className="flex items-center gap-2" data-testid="sync-status-banner">
        <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
        <span>
          Sync in progress — refreshing Google Search Console and GA4 data. Charts and tables update
          when the sync completes.
        </span>
      </span>
    </Alert>
  ) : null;
}
function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}
function TrafficAlerts({
  sync,
  includeSuccess = true,
}: Readonly<{ sync: ReturnType<typeof useTrafficSync>; includeSuccess?: boolean }>) {
  return (
    <>
      {sync.notice ? <Alert tone="info">{sync.notice}</Alert> : null}
      {sync.mutation.isError ? (
        <Alert tone="danger">{errorMessage(sync.mutation.error)}</Alert>
      ) : null}
      {includeSuccess && sync.outcome === 'succeeded' ? (
        <Alert tone="success">Sync complete — charts and tables now render the new snapshot.</Alert>
      ) : null}
      {sync.outcome === 'failed' ? (
        <Alert tone="warning">
          Sync finished with errors — previously imported data is unchanged. Check Settings →
          Integrations for details.
        </Alert>
      ) : null}
    </>
  );
}
