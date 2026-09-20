'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, RefreshCw, Settings2, Unplug } from 'lucide-react';

import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { SearchIntelligenceCitationMatcher } from '@/components/search-intelligence/search-intelligence-citation-matcher';
import { SearchIntelligenceDatasetView } from '@/components/search-intelligence/search-intelligence-dataset-view';
import { SearchIntelligenceReviewDrawer } from '@/components/search-intelligence/search-intelligence-review-drawer';
import { SearchIntelligenceOverview } from '@/components/search-intelligence/search-intelligence-overview';
import { formatEvidenceValue } from './search-intelligence-format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Drawer } from '@/components/ui/drawer';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { TabPanel, TabsBar, TabsRoot } from '@/components/ui/tabs';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
  type SearchIntelligenceReadiness,
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
const KINDS: Record<Tab, readonly string[]> = {
  overview: [],
  keywords: ['ranking_keywords', 'keyword_suggestions'],
  competitors: ['footprint', 'missing_keywords', 'shared_keywords'],
  backlinks: ['backlink_summary', 'referring_domains', 'destination_pages', 'citation_matches'],
};

function DatasetCollection({ datasets }: Readonly<{ datasets: SearchIntelligenceDataset[] }>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    datasets.find((dataset) => dataset.id === selectedId) ??
    datasets.find((dataset) => dataset.dataset_kind !== 'backlink_summary') ??
    datasets[0];
  if (!selected)
    return (
      <EmptyState
        icon={Database}
        heading="No saved dataset"
        description="Acquire this scope to publish a durable snapshot."
      />
    );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {datasets.map((dataset) => (
          <Button
            key={dataset.id}
            size="sm"
            variant={dataset.id === selected.id ? 'primary' : 'secondary'}
            onClick={() => setSelectedId(dataset.id)}
          >
            {dataset.dataset_kind.replaceAll('_', ' ')} · {dataset.target_hostname}
          </Button>
        ))}
      </div>
      {selected.dataset_kind === 'backlink_summary' ? (
        <BacklinkSummary dataset={selected} />
      ) : (
        <SearchIntelligenceDatasetView key={selected.id} dataset={selected} />
      )}
    </div>
  );
}

function BacklinkSummary({ dataset }: Readonly<{ dataset: SearchIntelligenceDataset }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dataset.target_hostname} backlink summary</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(dataset.summary).map(([label, value]) => (
            <div key={label} className="grid gap-1">
              <dt className="text-muted text-sm">{label.replaceAll('_', ' ')}</dt>
              <dd className="text-xl tabular-nums">{formatEvidenceValue(value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function SearchIntelligencePage() {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useUrlState('tab', TAB_CODEC);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
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
        dataset.target_origin,
        dataset.comparison_origin,
        dataset.location_code,
        dataset.language_code,
      ]);
      if (!result.has(key)) result.set(key, dataset);
    }
    return [...result.values()];
  }, [readiness.data?.datasets]);
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
  if (!data.connected)
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
        controls={<ScopeBand data={data} tab={tab} latest={latestDatasets[0]} />}
      >
        <Stack gap="workspace">
          <RunNotice run={data.latest_run} />
          <TabPanel value="overview">
            <SearchIntelligenceOverview
              datasets={latestDatasets}
              competitors={data.competitors}
              ownedHostname={data.owned_targets[0]?.hostname ?? ''}
              onNavigate={setTab}
            />
          </TabPanel>
          {TABS.filter(({ value }) => value !== 'overview').map(({ value }) => (
            <TabPanel key={value} value={value}>
              <div className="grid gap-4">
                {value === 'keywords' ? (
                  <div>
                    <Button variant="secondary" onClick={() => openReview('seed')}>
                      Research a keyword
                    </Button>
                  </div>
                ) : null}
                {value === 'backlinks' ? (
                  <SearchIntelligenceCitationMatcher
                    datasets={latestDatasets}
                    onDerived={() =>
                      queryClient.invalidateQueries({
                        queryKey: searchIntelligenceKeys.readiness(
                          activeProject?.workspace_id,
                          activeProject?.id,
                        ),
                      })
                    }
                  />
                ) : null}
                <DatasetCollection
                  datasets={latestDatasets.filter((dataset) =>
                    KINDS[value].includes(dataset.dataset_kind),
                  )}
                />
              </div>
            </TabPanel>
          ))}
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

function ScopeBand({
  data,
  tab,
  latest,
}: Readonly<{
  data: SearchIntelligenceReadiness;
  tab: Tab;
  latest?: SearchIntelligenceDataset;
}>) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3 py-2">
      <span className={textRole('bodyStrong')}>{data.owned_targets[0]?.hostname}</span>
      <span className={textRole('meta')}>
        {tab === 'backlinks'
          ? 'Canonical website · all referring countries'
          : `${searchMarketLabel(data.preferences.location_code)} · ${data.preferences.language_code || 'Language not set'}`}
      </span>
      <span className={textRole('meta', 'ml-auto')}>
        {latest?.published_at
          ? `Saved ${new Date(latest.published_at).toLocaleString()}`
          : 'No saved analysis'}
      </span>
    </div>
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
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Cost details"
      description="Recorded Search Intelligence usage for recent operations."
    >
      {pending ? (
        <Skeleton className="h-32 w-full" />
      ) : failed ? (
        <ReadError error={null} fallback="Cost history could not be loaded." onRetry={onRetry} />
      ) : runs?.length ? (
        <div className="grid gap-3">
          {runs.map((run) => (
            <Card key={run.id}>
              <CardContent className="grid gap-3">
                <p className={textRole('bodyStrong', 'capitalize')}>
                  {run.action.replaceAll('_', ' ')} · {run.status.replaceAll('_', ' ')}
                </p>
                <p className={textRole('meta')}>{new Date(run.created_at).toLocaleString()}</p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className={textRole('label')}>Estimated</dt>
                    <dd>${run.estimated_cost_usd}</dd>
                  </div>
                  <div>
                    <dt className={textRole('label')}>Provider reported</dt>
                    <dd>
                      {run.provider_reported_cost_usd === null
                        ? 'Unresolved'
                        : `$${run.provider_reported_cost_usd}`}
                    </dd>
                  </div>
                  <div>
                    <dt className={textRole('label')}>Calls completed</dt>
                    <dd>{run.completed_calls}</dd>
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
      ) : (
        <p className={textRole('body')}>No Search Intelligence operation has been recorded.</p>
      )}
    </Drawer>
  );
}
