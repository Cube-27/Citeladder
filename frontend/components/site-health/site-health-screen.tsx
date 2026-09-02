'use client';

import { type ReactNode, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { Tabs } from '@/components/ui/tabs';
import { SiteHealthDashboardLayout } from '@/components/site-health/dashboard-layout';
import { AeoReadinessPanel } from '@/components/site-health/aeo-readiness-panel';
import { ArchitecturePanel } from '@/components/site-health/architecture-panel';
import { ChangesPanel } from '@/components/site-health/changes-panel';
import { OverviewPanel } from '@/components/site-health/overview-panel';
import { ScreenSkeleton } from '@/components/site-health/screen-states';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { siteHealthQueries } from '@/lib/api/site-health';
import { useProjectContext } from '@/lib/project/project-context';
import { useSiteHealthScreen } from '@/lib/site-health/use-site-health-screen';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';

export function SiteHealthScreen() {
  const { activeProject, isLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const screen = useSiteHealthScreen(projectId);
  return <SiteHealthContent projectId={projectId} projectLoading={isLoading} screen={screen} />;
}

function SiteHealthContent({
  projectId,
  projectLoading,
  screen,
}: Readonly<{
  projectId: string | null;
  projectLoading: boolean;
  screen: ReturnType<typeof useSiteHealthScreen>;
}>) {
  const {
    entitlementQuery,
    phase,
    crawl,
    active,
    startPending,
    cancelMutation,
    startCrawl,
    cancelCrawl,
    runExport,
    exporting,
  } = screen;
  const defaultTab: AnalysisTab = phase === 'dashboard' ? 'overview' : 'pages';
  const tabCodec = useMemo(
    () =>
      stringUrlCodec(
        ANALYSIS_TABS.map((item) => item.value),
        defaultTab,
      ),
    [defaultTab],
  );
  const [tab, selectTab] = useUrlState('tab', tabCodec, { clearKeys: ['cursor', 'sort'] });
  const blockingState = projectBlockingState(projectId, projectLoading, screen);
  const headerActions = crawl ? (
    <CrawlActions
      active={active}
      exporting={exporting}
      cancelPending={cancelMutation.isPending}
      startPending={startPending}
      onExport={() => runExport('csv', 'pages')}
      onCancel={cancelCrawl}
      onStart={startCrawl}
    />
  ) : undefined;
  const prefetchTab = useSiteHealthTabPrefetch(projectId, crawl?.id);
  return (
    <div className="grid min-w-0 gap-[var(--page-section-gap)]">
      {!blockingState ? <SiteHealthNotices screen={screen} /> : null}
      <AnalysisTabs
        tab={tab}
        setTab={selectTab}
        actions={blockingState ? undefined : headerActions}
        onIntent={prefetchTab}
      />
      {blockingState ?? (
        <AnalysisPanel
          tab={tab}
          crawlId={crawl?.id}
          projectId={projectId!}
          screen={screen}
          entitlement={entitlementQuery.data!}
        />
      )}
    </div>
  );
}

function projectBlockingState(
  projectId: string | null,
  projectLoading: boolean,
  screen: ReturnType<typeof useSiteHealthScreen>,
) {
  if (projectLoading) return <ScreenSkeleton label="Loading your Site Health project…" />;
  if (!projectId)
    return <Alert tone="info">Select or create a project to analyze its site health.</Alert>;
  return screenBlockingState({
    entitlementLoading: screen.entitlementQuery.isLoading,
    dashboardLoading: screen.dashboardQuery.isLoading,
    entitlementError: screen.entitlementQuery.isError,
    dashboardError: screen.dashboardQuery.isError,
    resolverStatus: screen.entitlementQuery.data?.resolver_status,
    phase: screen.phase,
  });
}

function useSiteHealthTabPrefetch(projectId: string | null, crawlId: string | undefined) {
  const queryClient = useQueryClient();
  return (nextTab: AnalysisTab) => {
    if (!projectId) return;
    if (nextTab === 'overview') {
      void queryClient.prefetchQuery(siteHealthQueries.overview(projectId, crawlId));
    } else if (nextTab === 'architecture') {
      void queryClient.prefetchQuery(siteHealthQueries.architecture(projectId, crawlId));
    } else if (nextTab === 'aeo-readiness') {
      void queryClient.prefetchQuery(siteHealthQueries.aeoReadiness(projectId, crawlId));
    } else if (nextTab === 'changes') {
      void queryClient.prefetchQuery(siteHealthQueries.changesSummary(projectId));
    }
  };
}

function SiteHealthNotices({
  screen,
}: Readonly<{ screen: ReturnType<typeof useSiteHealthScreen> }>) {
  return (
    <>
      {screen.exportError ? <Alert tone="danger">{screen.exportError}</Alert> : null}
      {screen.createMutation.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(screen.createMutation.error, { action: 'start a crawl' })}
          onRetry={screen.startCrawl}
        />
      ) : null}
      {screen.cancelMutation.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(screen.cancelMutation.error, { action: 'stop the crawl' })}
          onRetry={screen.cancelCrawl}
        />
      ) : null}
      {screen.stalled ? (
        <Alert tone="warning">
          This crawl has an expired worker lease. Recovery is still being checked; results already
          persisted remain visible below.
        </Alert>
      ) : null}
    </>
  );
}

type AnalysisTab = 'overview' | 'pages' | 'architecture' | 'aeo-readiness' | 'changes';

const ANALYSIS_TABS: ReadonlyArray<{ value: AnalysisTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'pages', label: 'Pages' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'aeo-readiness', label: 'AEO Readiness' },
  { value: 'changes', label: 'Changes' },
];

function AnalysisTabs({
  tab,
  setTab,
  actions,
  onIntent,
}: Readonly<{
  tab: string;
  setTab: (tab: AnalysisTab) => void;
  actions?: ReactNode;
  onIntent: (tab: AnalysisTab) => void;
}>) {
  // Page actions share the tablist row: the tablist's own block-end rule is
  // suppressed so the row wrapper can carry it across the full width, keeping
  // the selected tab's underline flush with the rule under the buttons.
  return (
    <div className="border-border relative z-10 flex min-h-10 items-center gap-3 border-b">
      <Tabs
        value={tab as AnalysisTab}
        onValueChange={setTab}
        items={ANALYSIS_TABS}
        ariaLabel="Website analysis"
        rootClassName="min-w-0 flex-1"
        className="border-b-0"
        onIntent={onIntent}
      />
      {actions ? <div className="ml-auto flex shrink-0 items-center">{actions}</div> : null}
    </div>
  );
}

function AnalysisPanel({
  tab,
  crawlId,
  projectId,
  screen,
  entitlement,
}: Readonly<{
  tab: string;
  crawlId: string | undefined;
  projectId: string;
  screen: ReturnType<typeof useSiteHealthScreen>;
  entitlement: NonNullable<ReturnType<typeof useSiteHealthScreen>['entitlementQuery']['data']>;
}>) {
  if (tab === 'pages')
    return <SiteHealthDashboardLayout screen={screen} entitlement={entitlement} />;
  if (tab === 'overview' && crawlId)
    return (
      <OverviewPanel
        projectId={projectId}
        crawlId={crawlId}
        crawl={screen.crawl}
        dashboard={screen.dashboardQuery.data}
      />
    );
  // Architecture reads a project-scoped projection, so it renders its own
  // "derived after the crawl finishes" state rather than needing a crawl here.
  if (tab === 'architecture')
    return <ArchitecturePanel key={projectId} projectId={projectId} crawlId={crawlId} />;
  if (tab === 'aeo-readiness' && crawlId)
    return <AeoReadinessPanel projectId={projectId} crawlId={crawlId} />;
  if (tab === 'changes') return <ChangesPanel key={projectId} projectId={projectId} />;
  return <Alert tone="info">Run a crawl before opening Website analysis.</Alert>;
}

function screenBlockingState({
  entitlementLoading,
  dashboardLoading,
  entitlementError,
  dashboardError,
  resolverStatus,
  phase,
}: Readonly<{
  entitlementLoading: boolean;
  dashboardLoading: boolean;
  entitlementError: boolean;
  dashboardError: boolean;
  resolverStatus: string | undefined;
  phase: string;
}>) {
  if (entitlementError || dashboardError)
    return <Alert tone="danger">Could not load Site Health. Please refresh.</Alert>;
  if (resolverStatus === 'entitlement_unresolved')
    return (
      <Alert tone="warning">
        Site Health access could not be resolved. Refresh to try again, or contact your workspace
        administrator if this continues.
      </Alert>
    );
  if (entitlementLoading || dashboardLoading || phase === 'resolving')
    return (
      <ScreenSkeleton
        label={
          entitlementLoading
            ? 'Checking Site Health access…'
            : 'Loading your latest Site Health crawl…'
        }
      />
    );
  return null;
}

function CrawlActions({
  active,
  exporting,
  cancelPending,
  startPending,
  onExport,
  onCancel,
  onStart,
}: Readonly<{
  active: boolean;
  exporting: boolean;
  cancelPending: boolean;
  startPending: boolean;
  onExport: () => void;
  onCancel: () => void;
  onStart: () => void;
}>) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export'}
      </Button>
      {active ? (
        <Button variant="destructive" size="sm" onClick={onCancel} disabled={cancelPending}>
          {cancelPending ? 'Stopping…' : 'Stop crawl'}
        </Button>
      ) : (
        <Button size="sm" onClick={() => onStart()} disabled={startPending}>
          {startPending ? 'Starting…' : 'Run new crawl'}
        </Button>
      )}
    </div>
  );
}
