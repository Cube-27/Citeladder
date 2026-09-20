'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, RefreshCw, Settings2, Unplug } from 'lucide-react';

import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { SearchIntelligenceCitationMatcher } from '@/components/search-intelligence/search-intelligence-citation-matcher';
import { SearchIntelligenceDatasetView } from '@/components/search-intelligence/search-intelligence-dataset-view';
import { SearchIntelligenceReviewDrawer } from '@/components/search-intelligence/search-intelligence-review-drawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { TabPanel, TabsBar, TabsRoot } from '@/components/ui/tabs';
import {
  searchIntelligenceApi,
  type SearchIntelligenceDataset,
  type SearchIntelligenceRun,
} from '@/lib/api/search-intelligence';
import { searchIntelligenceKeys } from '@/lib/api/query-keys/search-intelligence';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectContext } from '@/lib/project/project-context';

const TABS = [
  { value: 'keywords', label: 'Keywords' },
  { value: 'gaps', label: 'Competitor gaps' },
  { value: 'backlinks', label: 'Backlinks' },
  { value: 'snapshots', label: 'Snapshots' },
] as const;
type Tab = (typeof TABS)[number]['value'];
const TAB_CODEC = stringUrlCodec(
  TABS.map(({ value }) => value),
  'keywords' as Tab,
);
const KINDS: Record<Tab, readonly string[]> = {
  keywords: ['footprint', 'ranking_keywords', 'keyword_suggestions'],
  gaps: ['missing_keywords', 'shared_keywords'],
  backlinks: ['backlink_summary', 'referring_domains', 'destination_pages', 'citation_matches'],
  snapshots: [],
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
            {dataset.dataset_kind.replaceAll('_', ' ')} · {dataset.target_domain}
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
        <CardTitle>{dataset.target_domain} backlink summary</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(dataset.summary).map(([label, value]) => (
            <div key={label} className="grid gap-1">
              <dt className="text-muted text-sm">{label.replaceAll('_', ' ')}</dt>
              <dd className="text-xl tabular-nums">
                {value === null ? 'Not measured' : String(value)}
              </dd>
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
      await queryClient.invalidateQueries({
        queryKey: searchIntelligenceKeys.readiness(activeProject?.workspace_id, activeProject?.id),
      });
    },
  });
  const openReview = (nextAction: string) => {
    setAction(nextAction);
    setDrawerOpen(true);
  };
  const latestDatasets = useMemo(() => {
    const result = new Map<string, SearchIntelligenceDataset>();
    for (const dataset of readiness.data?.datasets ?? []) {
      const key = `${dataset.dataset_kind}:${dataset.target_origin}:${dataset.comparison_origin}`;
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
  const actions = (
    <>
      <Button variant="secondary" onClick={() => openReview('refresh')}>
        Refresh
      </Button>
      <Button variant="secondary" onClick={() => openReview('increase_depth')}>
        Expand depth
      </Button>
      <Button onClick={() => openReview('analysis')}>Acquire latest</Button>
    </>
  );
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
      <PageShell tabs={tabs} actions={actions}>
        <Stack gap="workspace">
          {data.latest_run?.status === 'queued' || data.latest_run?.status === 'running' ? (
            <div className="border-accent/30 bg-accent/5 flex items-center gap-2 rounded-[var(--radius-control)] border p-3 text-sm">
              <RefreshCw className="size-4 animate-spin" aria-hidden />
              Acquisition in progress: {data.latest_run.completed_calls} of{' '}
              {data.latest_run.planned_calls} calls complete.
            </div>
          ) : null}
          {data.latest_run &&
          ['partial', 'failed', 'uncertain'].includes(data.latest_run.status) ? (
            <output className="border-warning/40 bg-warning/10 block rounded-[var(--radius-control)] border p-3 text-sm">
              <Stack gap="tight">
                <p className={textRole('bodyStrong', 'capitalize')}>
                  Acquisition {data.latest_run.status}
                </p>
                <p className="text-muted">
                  {data.latest_run.error_detail ||
                    data.latest_run.completed_calls +
                      ' of ' +
                      data.latest_run.planned_calls +
                      ' reviewed calls completed. Published datasets remain available below.'}
                </p>
              </Stack>
            </output>
          ) : null}
          {TABS.slice(0, 3).map(({ value }) => (
            <TabPanel key={value} value={value}>
              <div className="grid gap-4">
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
          <TabPanel value="snapshots">
            <div className="grid gap-3">
              {data.datasets.length ? (
                data.datasets.map((dataset) => (
                  <Card key={dataset.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div className="grid gap-1">
                        <p className={textRole('bodyStrong')}>
                          {dataset.dataset_kind.replaceAll('_', ' ')} · {dataset.target_domain}
                        </p>
                        <p className="text-muted text-sm">
                          {dataset.status} · {dataset.coverage} ·{' '}
                          {dataset.unique_rows_saved.toLocaleString()} rows
                        </p>
                      </div>
                      <span className="text-muted text-sm">
                        {dataset.published_at
                          ? new Date(dataset.published_at).toLocaleString()
                          : 'Not published'}
                      </span>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <EmptyState
                  icon={Database}
                  heading="No snapshots yet"
                  description="Confirmed acquisitions publish immutable datasets here."
                />
              )}
            </div>
          </TabPanel>
          <SearchIntelligenceReviewDrawer
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
