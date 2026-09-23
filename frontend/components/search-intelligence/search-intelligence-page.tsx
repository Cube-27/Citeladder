'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Settings2, Unplug } from 'lucide-react';

import { PageShell } from '@/components/layout/page-shell';
import { DisplayTime } from '@/components/ui/display-time';
import { ProjectLink } from '@/components/layout/scoped-link';
import { SearchIntelligenceCitationMatcher } from '@/components/search-intelligence/search-intelligence-citation-matcher';
import { SearchIntelligenceCollection } from './search-intelligence-collection';
import { SearchIntelligenceReviewDrawer } from '@/components/search-intelligence/search-intelligence-review-drawer';
import { SearchIntelligenceOverview } from '@/components/search-intelligence/search-intelligence-overview';
import { formatSearchNumber, reportedCost } from './search-intelligence-format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Drawer } from '@/components/ui/drawer';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { SavedViewControls, ScopeBand } from './search-intelligence-scope';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { TabPanel, TabsBar, TabsRoot } from '@/components/ui/tabs';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
  type SearchIntelligenceRun,
} from '@/lib/api/search-intelligence';
import { searchIntelligenceKeys } from '@/lib/api/query-keys/search-intelligence';
import { searchMarketLabel } from '@/lib/config/search-intelligence';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectContext } from '@/lib/project/project-context';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'keywords', label: 'Keywords' },
  { value: 'competitors', label: 'Competitors' },
  { value: 'backlinks', label: 'Backlinks' },
] as const;
type Tab = (typeof TABS)[number]['value'];
const TAB_CODEC = stringUrlCodec(
  TABS.map(({ value }) => value),
  'overview' as Tab,
);
export function SearchIntelligencePage() {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useUrlState('tab', TAB_CODEC);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [citationOpen, setCitationOpen] = useState(false);
  const [comparison, setComparison] = useState<SearchIntelligenceDataset | null>(null);
  const [market, setMarket] = useState('');
  const [scope, setScope] = useState('');
  const [action, setAction] = useState('analysis');
  const readiness = useQuery({
    queryKey: searchIntelligenceKeys.readiness(activeProject?.workspace_id, activeProject?.id),
    queryFn: ({ signal }) =>
      searchIntelligenceApi.readiness(activeProject!.id, {
        signal,
        workspaceId: activeProject!.workspace_id,
      }),
    enabled: Boolean(activeProject),
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.latest_run?.status ?? '') ? 5000 : false,
  });
  const runsQuery = useQuery({
    queryKey: searchIntelligenceKeys.runs(activeProject?.workspace_id, activeProject?.id),
    queryFn: ({ signal }) =>
      searchIntelligenceApi.runs(activeProject!.id, {
        signal,
        workspaceId: activeProject!.workspace_id,
      }),
    enabled: Boolean(activeProject && costOpen),
  });
  const reviewMutation = useMutation({
    mutationFn: (payload: Parameters<typeof searchIntelligenceApi.review>[1]) =>
      searchIntelligenceApi.review(activeProject!.id, payload, {
        workspaceId: activeProject!.workspace_id,
      }),
  });
  const confirmMutation = useMutation({
    mutationFn: (runId: string) =>
      searchIntelligenceApi.confirm(activeProject!.id, runId, {
        workspaceId: activeProject!.workspace_id,
      }),
    onSuccess: async () => {
      setDrawerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: searchIntelligenceKeys.readiness(
            activeProject?.workspace_id,
            activeProject?.id,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: searchIntelligenceKeys.runs(activeProject?.workspace_id, activeProject?.id),
        }),
      ]);
    },
  });
  const openReview = (nextAction: string) => {
    setAction(nextAction);
    setDrawerOpen(true);
  };
  const latestDatasets = useMemo(() => {
    const result = new Map<string, SearchIntelligenceDataset>();
    for (const dataset of readiness.data?.datasets ?? []) {
      const key = JSON.stringify([
        dataset.dataset_kind,
        dataset.research_scope ?? 'exact_host',
        dataset.acquisition,
        dataset.target_origin,
        dataset.comparison_origin,
        dataset.location_code,
        dataset.language_code,
      ]);
      if (!result.has(key)) result.set(key, dataset);
    }
    return [...result.values()];
  }, [readiness.data?.datasets]);
  const scopes = [...new Set(latestDatasets.map((item) => item.research_scope ?? 'exact_host'))];
  const activeScope = scopes.includes(scope as 'exact_host' | 'domain_subdomains')
    ? scope
    : scopes[0];
  const markets = [
    ...new Map(
      latestDatasets
        .filter(
          (item) =>
            (item.research_scope ?? 'exact_host') === activeScope && item.location_code !== null,
        )
        .map((item) => [
          `${item.location_code}:${item.language_code}`,
          {
            value: `${item.location_code}:${item.language_code}`,
            label: `${searchMarketLabel(item.location_code)} · ${item.language_code}`,
          },
        ]),
    ).values(),
  ];
  const activeMarket = markets.find((item) => item.value === market)?.value ?? markets[0]?.value;
  const datasets = latestDatasets.filter(
    (item) =>
      (item.research_scope ?? 'exact_host') === activeScope &&
      (item.location_code === null ||
        `${item.location_code}:${item.language_code}` === activeMarket),
  );
  const openComparison = (dataset: SearchIntelligenceDataset) => {
    setComparison(dataset);
    setTab('competitors');
  };
  if (readiness.isPending)
    return (
      <PageShell>
        <Skeleton className="h-80 w-full" />
      </PageShell>
    );
  if (readiness.isError)
    return (
      <PageShell>
        <ReadError
          error={readiness.error}
          fallback="Search Intelligence could not be loaded."
          onRetry={() => void readiness.refetch()}
        />
      </PageShell>
    );
  const data = readiness.data;
  const tabs = <TabsBar items={TABS} ariaLabel="Search Intelligence views" variant="band" />;
  if (!data.connected && !data.datasets.length)
    return (
      <TabsRoot value={tab} onValueChange={setTab}>
        <PageShell tabs={tabs}>
          <EmptyState
            icon={Unplug}
            heading="Connect DataForSEO"
            description="Search Intelligence needs an enabled workspace DataForSEO credential before it can prepare a priced acquisition."
            action={
              <ProjectLink
                className="focus-ring text-accent-text underline"
                href="/settings?tab=providers"
              >
                Open provider settings
              </ProjectLink>
            }
          />
        </PageShell>
      </TabsRoot>
    );
  if (!data.owned_targets.length)
    return (
      <TabsRoot value={tab} onValueChange={setTab}>
        <PageShell tabs={tabs}>
          <EmptyState
            icon={Settings2}
            heading="Set a canonical project URL"
            description="A normalized apex or www project target is required before paid acquisition can be scoped safely."
          />
        </PageShell>
      </TabsRoot>
    );
  return (
    <TabsRoot value={tab} onValueChange={setTab}>
      <PageShell
        tabs={tabs}
        actions={
          <PageActions
            hasDatasets={Boolean(data.datasets.length)}
            onReview={openReview}
            onCost={() => setCostOpen(true)}
          />
        }
        controls={
          <ScopeBand
            data={data}
            tab={tab}
            latest={datasets.find((item) =>
              tab === 'backlinks' ? item.location_code === null : item.location_code !== null,
            )}
            marketControl={
              <SavedViewControls
                scopes={scopes}
                scope={activeScope}
                markets={markets}
                market={activeMarket}
                tab={tab}
                onScope={(value) => {
                  setScope(value);
                  setComparison(null);
                }}
                onMarket={(value) => {
                  setMarket(value);
                  setComparison(null);
                }}
              />
            }
          />
        }
      >
        <Stack gap="workspace" className="min-w-0">
          <RunNotice run={data.latest_run} />
          <TabPanel value="overview" className="min-w-0">
            <SearchIntelligenceOverview
              datasets={datasets}
              competitors={data.competitors}
              ownedHostname={data.owned_targets[0]?.hostname ?? ''}
              onOpen={openComparison}
            />
          </TabPanel>
          {TABS.filter((item) => item.value !== 'overview').map(({ value }) => (
            <TabPanel key={value} value={value} className="min-w-0">
              <SearchIntelligenceCollection
                tab={value}
                datasets={datasets}
                competitors={data.competitors}
                selected={value === 'competitors' ? comparison : null}
                onSelect={setComparison}
                onExpand={() => openReview('increase_depth')}
                action={
                  value === 'keywords' ? (
                    <Button variant="secondary" size="sm" onClick={() => openReview('seed')}>
                      Research a keyword
                    </Button>
                  ) : null
                }
              />
              {value === 'backlinks' &&
              datasets.some(
                (item) => item.dataset_kind === 'referring_domains' && item.unique_rows_saved > 0,
              ) ? (
                <Button variant="ghost" size="sm" onClick={() => setCitationOpen(true)}>
                  Match with Visibility citations
                </Button>
              ) : null}
            </TabPanel>
          ))}
          <Drawer
            open={citationOpen}
            onOpenChange={setCitationOpen}
            title="Match Visibility citations"
          >
            <SearchIntelligenceCitationMatcher
              datasets={datasets}
              onDerived={() =>
                queryClient.invalidateQueries({
                  queryKey: searchIntelligenceKeys.readiness(
                    activeProject?.workspace_id,
                    activeProject?.id,
                  ),
                })
              }
            />
          </Drawer>
          <CostDetails
            open={costOpen}
            onOpenChange={setCostOpen}
            runs={runsQuery.data}
            pending={runsQuery.isPending}
            failed={runsQuery.isError}
            onRetry={() => void runsQuery.refetch()}
          />
          <SearchIntelligenceReviewDrawer
            key={`${activeProject?.workspace_id}:${activeProject?.id}:${action}:${drawerOpen}`}
            open={drawerOpen}
            action={action}
            readiness={data}
            onOpenChange={setDrawerOpen}
            onReview={(payload) =>
              reviewMutation.mutateAsync(payload) as Promise<SearchIntelligenceRun>
            }
            onConfirm={async (runId) => {
              await confirmMutation.mutateAsync(runId);
            }}
            busy={reviewMutation.isPending || confirmMutation.isPending}
          />
        </Stack>
      </PageShell>
    </TabsRoot>
  );
}

function PageActions({
  hasDatasets,
  onReview,
  onCost,
}: Readonly<{
  hasDatasets: boolean;
  onReview: (action: string) => void;
  onCost: () => void;
}>) {
  return (
    <>
      <Button variant="ghost" onClick={onCost}>
        Cost details
      </Button>
      <Button variant="secondary" onClick={() => onReview('analysis')}>
        Analysis settings
      </Button>
      <Button onClick={() => onReview(hasDatasets ? 'refresh' : 'analysis')}>
        {hasDatasets ? 'Refresh' : 'Run first analysis'}
      </Button>
    </>
  );
}

function RunNotice({ run }: Readonly<{ run: SearchIntelligenceRun | null }>) {
  if (!run) return null;
  if (run.status === 'queued' || run.status === 'running')
    return (
      <div className="border-accent/30 bg-accent/5 flex items-center gap-2 rounded-[var(--radius-control)] border p-3 text-sm">
        <RefreshCw className="size-4 animate-spin" aria-hidden />
        Acquisition in progress: {run.completed_calls} of {run.planned_calls} calls complete.
      </div>
    );
  if (!['partial', 'failed', 'uncertain'].includes(run.status)) return null;
  return (
    <output className="border-warning/40 bg-warning/10 block rounded-[var(--radius-control)] border p-3 text-sm">
      <Stack gap="tight">
        <p className={textRole('bodyStrong', 'capitalize')}>Acquisition {run.status}</p>
        <p className="text-muted">
          {run.error_detail ||
            `${run.completed_calls} of ${run.planned_calls} reviewed calls completed. Published datasets remain available below.`}
        </p>
      </Stack>
    </output>
  );
}

function CostDetails({
  open,
  onOpenChange,
  runs,
  pending,
  failed,
  onRetry,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: SearchIntelligenceRun[] | undefined;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
}>) {
  let content = (
    <p className={textRole('body')}>No Search Intelligence operation has been recorded.</p>
  );
  if (runs?.length) {
    content = (
      <div className="grid gap-3">
        {runs.map((run) => (
          <Card key={run.id}>
            <CardContent className="grid gap-3">
              <p className={textRole('bodyStrong', 'capitalize')}>
                {run.action.replaceAll('_', ' ')} · {run.status.replaceAll('_', ' ')}
              </p>
              <p className={textRole('meta')}>
                <DisplayTime value={run.created_at} />
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className={textRole('label')}>Estimated</dt>
                  <dd>${formatSearchNumber(run.estimated_cost_usd, 6)}</dd>
                </div>
                <div>
                  <dt className={textRole('label')}>Provider reported</dt>
                  <dd>{reportedCost(run)}</dd>
                </div>
                <div>
                  <dt className={textRole('label')}>Calls completed</dt>
                  <dd>
                    {run.completed_calls} of {run.planned_calls}
                  </dd>
                </div>
                <div>
                  <dt className={textRole('label')}>Saved result rows</dt>
                  <dd>{formatSearchNumber(run.received_rows)}</dd>
                </div>
                <div>
                  <dt className={textRole('label')}>Uncertain calls</dt>
                  <dd>{run.uncertain_calls}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (failed)
    content = (
      <ReadError error={null} fallback="Cost history could not be loaded." onRetry={onRetry} />
    );
  if (pending) content = <Skeleton className="h-32 w-full" />;
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Cost details"
      description="Recorded Search Intelligence usage for recent operations."
    >
      {content}
    </Drawer>
  );
}
