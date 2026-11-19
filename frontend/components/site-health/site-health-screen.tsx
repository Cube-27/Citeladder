import { useId, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { ICONS } from '@/lib/icons';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { TabRow, TabsRoot } from '@/components/ui/tabs';
import { RESERVED_CONTROLS } from '@/components/layout/page-shell';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';
import { Stack } from '@/components/ui/layout';
import { SiteHealthDashboardLayout } from '@/components/site-health/dashboard-layout';
import { PAGES_INVENTORY_URL_KEYS } from '@/components/site-health/inventory-section';
import { AeoReadinessPanel } from '@/components/site-health/aeo-readiness-panel';
import { ArchitecturePanel } from '@/components/site-health/architecture-panel';
import { ChangesPanel } from '@/components/site-health/changes-panel';
import { useCrawlSchedule } from '@/components/site-health/crawl-schedule-control';
import { InternalLinksPanel } from '@/components/site-health/internal-links-panel';
import {
  useInternalLinksBands,
  type LinksRead,
} from '@/components/site-health/internal-links-panel-bands';
import { OverviewPanel } from '@/components/site-health/overview-panel';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { httpErrorStatus } from '@/lib/api/errors';
import { warmQuery } from '@/lib/api/query-client';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { internalLinksQueries } from '@/lib/api/site-health-internal-links';
import type { CrawlRobotsHandling, SiteCrawl, SiteHealthEntitlement } from '@citeladder/contracts';
import { StartCrawlControl } from '@/components/site-health/robots-choice';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { useSiteHealthScreen } from '@/lib/site-health/use-site-health-screen';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { READ_FAILED, StateBlock } from '@/components/ui/state-block';

export function SiteHealthScreen() {
  const { workspaceId, projectId } = useProjectScope();
  return <SiteHealthContent projectId={projectId} workspaceId={workspaceId} />;
}

function SiteHealthContent({
  projectId,
  workspaceId,
}: Readonly<{
  projectId: string;
  workspaceId: string;
}>) {
  const screen = useSiteHealthScreen();
  const { entitlementQuery, crawl, active, startPending, cancelMutation, startCrawl, cancelCrawl } =
    screen;
  const [tab, selectTab] = useUrlState('tab', TAB_CODEC, {
    clearKeys: ['cursor', 'sort', ...PAGES_INVENTORY_URL_KEYS],
  });
  const blocking = projectBlockingState(screen);
  const mutationsAllowed = !entitlementQuery.isError;
  // Crawl controls are offered only to a role that may run crawls; the
  // schedule, a saved setting, only to one that may write.
  const canRun = useWorkspaceCapability('run');
  const canWrite = useWorkspaceCapability('write');
  const schedule = useCrawlSchedule(
    { workspaceId, projectId },
    Boolean(crawl) && mutationsAllowed && canWrite,
    crawl?.robots,
  );
  // Internal links' search, filters and header actions act on the analysis its panel draws.
  const links = useInternalLinksBands({
    scope: { projectId, workspaceId },
    enabled: tab === 'internal-links' && !blocking && Boolean(crawl),
    canAnalyze: mutationsAllowed,
  });
  const controls = tabControls({
    tab,
    blocking,
    crawled: Boolean(crawl),
    links: links.controls,
    linksActions: links.actions,
  });
  // The masthead holds the crawl controls and is the same on every tab; a
  // tab's own actions (Internal links' Analyze again, each export) sit at the
  // end of that tab's control row or table toolbar.
  const headerActions =
    crawl && mutationsAllowed && canRun ? (
      <CrawlActions
        crawl={crawl}
        active={active}
        cancelPending={cancelMutation.isPending}
        startPending={startPending}
        schedule={schedule.control}
        onCancel={cancelCrawl}
        onStart={(robots) => startCrawl({ project_id: projectId, robots })}
      />
    ) : undefined;
  const prefetchTab = useSiteHealthTabPrefetch(workspaceId, projectId, crawl?.id, !active);
  // Every state draws the loaded page's bands — the tab row included — with
  // the state where the panel will be, so a failed read or the first load
  // never takes the tabs away and the work arrives without moving them.
  return (
    <TabsRoot value={tab} onValueChange={selectTab}>
      <ReportPage
        actions={blocking?.kind === 'state' ? undefined : headerActions}
        tabs={
          <TabRow items={ANALYSIS_TABS} ariaLabel="Site health analysis" onIntent={prefetchTab} />
        }
        filters={controls ? <FilterBar {...controls} /> : undefined}
      >
        {blocking ? (
          <SiteHealthBlocked blocking={blocking} />
        ) : (
          <Stack gap="workspace" className="min-w-0">
            <SiteHealthNotices screen={screen} mutationsAllowed={mutationsAllowed} />
            {schedule.notice}
            <SiteHealthRefreshFailures screen={screen} />
            {/* Before the first crawl every tab says the same one next step. */}
            {crawl ? (
              <AnalysisPanel
                tab={tab}
                crawlId={crawl.id}
                projectId={projectId}
                workspaceId={workspaceId}
                screen={screen}
                entitlement={entitlementQuery.data!.site_health}
                mutationsAllowed={mutationsAllowed}
                linksRead={links.read}
              />
            ) : (
              <FirstCrawl
                canRun={canRun}
                onStart={() => startCrawl()}
                pending={startPending}
                allowed={mutationsAllowed}
              />
            )}
          </Stack>
        )}
      </ReportPage>
    </TabsRoot>
  );
}

/**
 * The selected tab's control row: Internal links alone has one (Pages' view,
 * filter and export scope its table, so they lead that table's toolbar), and
 * it ends with that tab's own run action before its export. It holds the row
 * through the first load, so its work starts on the same line once it lands.
 */
function tabControls({
  tab,
  blocking,
  crawled,
  links,
  linksActions,
}: Readonly<{
  tab: AnalysisTab;
  blocking: BlockingState | null;
  /** False before the first crawl, when the tab holds only the first-crawl state. */
  crawled: boolean;
  links: FilterBarProps | undefined;
  linksActions: ReactNode;
}>): FilterBarProps | undefined {
  if (tab !== 'internal-links') return undefined;
  if (blocking?.kind === 'loading') return RESERVED_CONTROLS;
  if (blocking || !crawled || !links) return undefined;
  if (!linksActions) return links;
  return {
    ...links,
    actions: (
      <>
        {linksActions}
        {links.actions}
      </>
    ),
  };
}

/** What stands in for the analysis: the one first-load wait, or a state that replaces the page. */
type BlockingState =
  | Readonly<{ kind: 'loading'; label: string }>
  | Readonly<{ kind: 'state'; node: ReactNode }>;

function SiteHealthBlocked({ blocking }: Readonly<{ blocking: BlockingState }>) {
  switch (blocking.kind) {
    case 'state':
      return blocking.node;
    case 'loading':
      // The default tab's shape: its figures, then its table.
      return (
        <Stack gap="workspace" className="min-w-0">
          <StateBlock kind="loading" label={blocking.label} shape={{ kind: 'figures' }} />
          <StateBlock kind="loading" label={blocking.label} shape={{ kind: 'table' }} />
        </Stack>
      );
    default: {
      const exhaustive: never = blocking;
      return exhaustive;
    }
  }
}

function projectBlockingState(
  screen: ReturnType<typeof useSiteHealthScreen>,
): BlockingState | null {
  return screenBlockingState({
    entitlement: screen.entitlementQuery,
    dashboard: screen.dashboardQuery,
    resolverStatus: screen.entitlementQuery.data?.status,
    phase: screen.phase,
  });
}

function isAccessFailure(error: unknown): boolean {
  const status = httpErrorStatus(error);
  return status === 401 || status === 403;
}

function SiteHealthRefreshFailures({
  screen,
}: Readonly<{ screen: ReturnType<typeof useSiteHealthScreen> }>) {
  return (
    <>
      {screen.dashboardQuery.isError && screen.dashboardQuery.data ? (
        <Notice
          kind="read"
          {...readErrorProps(screen.dashboardQuery)}
          fallback={READ_FAILED}
          title="Couldn't load the latest Site health crawl"
        />
      ) : null}
      {screen.entitlementQuery.isError && screen.entitlementQuery.data ? (
        <Notice
          kind="read"
          {...readErrorProps(screen.entitlementQuery)}
          fallback={READ_FAILED}
          title="Couldn't load your Site health access"
        />
      ) : null}
    </>
  );
}

/**
 * Warm the tab the pointer is heading for.
 *
 * `terminal` gates the Overview alone, because the Overview snapshot does not
 * EXIST until the crawl terminalizes — warming it mid-crawl fetched a 404 into
 * the very cache entry the panel reads, and React Query keeps an error once it
 * has one. Hovering a tab is not a request to report a failure. Every other
 * projection here answers with its own "not available yet" payload instead of
 * an error, so those stay warm at any point in the run.
 */
function useSiteHealthTabPrefetch(
  workspaceId: string,
  projectId: string,
  crawlId: string | undefined,
  terminal: boolean,
) {
  const queryClient = useQueryClient();
  return (nextTab: AnalysisTab) => {
    const scope = { workspaceId, projectId };
    if (nextTab === 'overview') {
      if (terminal) warmQuery(queryClient, siteHealthQueries.overview(scope, crawlId));
    } else if (nextTab === 'architecture') {
      warmQuery(queryClient, siteHealthQueries.architecture(scope, crawlId));
    } else if (nextTab === 'aeo-readiness') {
      warmQuery(queryClient, siteHealthQueries.aeoReadiness(scope, crawlId));
    } else if (nextTab === 'internal-links') {
      warmQuery(queryClient, internalLinksQueries.analysis(scope));
    } else if (nextTab === 'changes') {
      warmQuery(queryClient, siteHealthQueries.changesSummary(scope));
    }
  };
}

function SiteHealthNotices({
  screen,
  mutationsAllowed,
}: Readonly<{
  screen: ReturnType<typeof useSiteHealthScreen>;
  mutationsAllowed: boolean;
}>) {
  return (
    <>
      {screen.exportError ? <Notice tone="negative">{screen.exportError}</Notice> : null}
      {mutationsAllowed && screen.createMutation.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(screen.createMutation.error, {
            action: 'start a crawl',
          })}
          onRetry={screen.retryStart}
        />
      ) : null}
      {mutationsAllowed && screen.cancelMutation.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(screen.cancelMutation.error, {
            action: 'stop the crawl',
          })}
          onRetry={screen.cancelCrawl}
        />
      ) : null}
      {screen.stalled ? (
        <Notice tone="warning">
          This crawl stopped making progress. It resumes automatically if it can; results so far are
          shown below.
        </Notice>
      ) : null}
    </>
  );
}

type AnalysisTab =
  | 'overview'
  | 'pages'
  | 'architecture'
  | 'aeo-readiness'
  | 'internal-links'
  | 'changes';

const ANALYSIS_TABS: ReadonlyArray<{ value: AnalysisTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'pages', label: 'Pages' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'aeo-readiness', label: 'AEO readiness' },
  { value: 'internal-links', label: 'Internal links' },
  { value: 'changes', label: 'Changes' },
];

/**
 * Site Health always opens on Pages and never changes tab by itself: not
 * while the crawl resolves, starts, runs or finishes (owner, 2026-11-02). A
 * tab the reader picks, or a `?tab=` link, stays as chosen.
 */
const TAB_CODEC = stringUrlCodec<AnalysisTab>(
  ANALYSIS_TABS.map((item) => item.value),
  'pages',
);

function AnalysisPanel({
  tab,
  crawlId,
  projectId,
  workspaceId,
  screen,
  entitlement,
  mutationsAllowed,
  linksRead,
}: Readonly<{
  tab: AnalysisTab;
  crawlId: string;
  projectId: string;
  workspaceId: string;
  screen: ReturnType<typeof useSiteHealthScreen>;
  entitlement: SiteHealthEntitlement;
  mutationsAllowed: boolean;
  linksRead: LinksRead;
}>) {
  switch (tab) {
    case 'pages':
      return (
        <SiteHealthDashboardLayout
          screen={screen}
          entitlement={entitlement}
          mutationsAllowed={mutationsAllowed}
        />
      );
    case 'overview':
      return (
        <OverviewPanel
          projectId={projectId}
          workspaceId={workspaceId}
          crawlId={crawlId}
          crawl={screen.crawl}
          dashboard={screen.dashboardQuery.data}
        />
      );
    case 'architecture':
      return (
        <ArchitecturePanel projectId={projectId} workspaceId={workspaceId} crawlId={crawlId} />
      );
    case 'aeo-readiness':
      return (
        <AeoReadinessPanel projectId={projectId} workspaceId={workspaceId} crawlId={crawlId} />
      );
    case 'internal-links':
      return <InternalLinksPanel read={linksRead} workspaceId={workspaceId} />;
    case 'changes':
      return <ChangesPanel projectId={projectId} workspaceId={workspaceId} />;
    default: {
      const exhaustive: never = tab;
      return exhaustive;
    }
  }
}

/** The project before its first crawl, on every tab; starting one is offered to a role that may run it. */
function FirstCrawl({
  canRun,
  ...run
}: Readonly<{ canRun: boolean; onStart: () => void; pending: boolean; allowed: boolean }>) {
  const noteId = useId();
  const start = canRun ? run : undefined;
  return (
    <div data-testid="site-health-empty">
      <StateBlock
        kind="empty"
        icon={ICONS.siteHealth}
        heading={start ? 'Run your first site crawl' : 'No site crawl yet'}
        description="A crawl reads your pages so CiteLadder can find issues, page structure and internal links."
        action={
          start ? (
            <ActionButton
              action="runCrawl"
              onClick={start.onStart}
              pending={start.pending}
              pendingLabel="Starting…"
              disabled={!start.allowed}
              aria-describedby={start.allowed ? undefined : noteId}
            />
          ) : undefined
        }
        actionNote={
          !start || start.allowed
            ? undefined
            : {
                id: noteId,
                text: "Your plan's crawl limits couldn't be checked. Reload to try again.",
              }
        }
      />
    </div>
  );
}

function screenBlockingState({
  entitlement,
  dashboard,
  resolverStatus,
  phase,
}: Readonly<{
  entitlement: ReturnType<typeof useSiteHealthScreen>['entitlementQuery'];
  dashboard: ReturnType<typeof useSiteHealthScreen>['dashboardQuery'];
  resolverStatus: string | undefined;
  phase: string;
}>): BlockingState | null {
  if (dashboard.isError && (!dashboard.data || isAccessFailure(dashboard.error)))
    return {
      kind: 'state',
      node: (
        <StateBlock
          kind="error"
          {...readErrorProps(dashboard)}
          fallback={READ_FAILED}
          title="Couldn't load the latest Site health crawl"
        />
      ),
    };
  if (entitlement.isError && (!entitlement.data || isAccessFailure(entitlement.error)))
    return {
      kind: 'state',
      node: (
        <StateBlock
          kind="error"
          {...readErrorProps(entitlement)}
          fallback={READ_FAILED}
          title="Couldn't load your Site health access"
        />
      ),
    };
  if (resolverStatus === 'entitlement_unresolved')
    return {
      kind: 'state',
      node: (
        <Notice tone="warning">
          Site health access could not be resolved. Refresh to try again, or contact your workspace
          administrator if this continues.
        </Notice>
      ),
    };
  if (entitlement.isLoading || dashboard.isLoading || phase === 'resolving')
    return {
      kind: 'loading',
      label: entitlement.isLoading
        ? 'Checking Site health access…'
        : 'Loading your latest Site health crawl…',
    };
  return null;
}

function CrawlActions({
  crawl,
  active,
  cancelPending,
  startPending,
  schedule,
  onCancel,
  onStart,
}: Readonly<{
  /** The shown crawl: its site and robots choice, which the next crawl keeps. */
  crawl: Pick<SiteCrawl, 'root_url' | 'robots'>;
  active: boolean;
  cancelPending: boolean;
  startPending: boolean;
  /** The crawl schedule, beside the crawl button. */
  schedule: ReactNode;
  onCancel: () => void;
  onStart: (robots?: CrawlRobotsHandling) => void;
}>) {
  const start = active ? null : (
    <StartCrawlControl
      siteUrl={crawl.root_url}
      robots={crawl.robots}
      pending={startPending}
      onStart={onStart}
    />
  );
  return (
    <>
      {schedule}
      {active ? (
        <Button variant="danger" onClick={onCancel} disabled={cancelPending}>
          {cancelPending ? 'Stopping…' : 'Stop crawl'}
        </Button>
      ) : null}
      {start ? <MastheadPrimary>{start}</MastheadPrimary> : null}
    </>
  );
}
