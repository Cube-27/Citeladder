'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, RefreshCw, Search, Sparkles } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FilterChip } from '@/components/ui/filter-chip';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { SearchField } from '@/components/ui/search-field';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectLink } from '@/components/layout/scoped-link';
import { DemandDetectorBar } from '@/components/demand/demand-detector-bar';
import { DemandEvidenceDrawer } from '@/components/demand/demand-evidence-drawer';
import { DemandSignalCard } from '@/components/demand/demand-signal-card';
import { DemandSummaryCards } from '@/components/demand/demand-summary-cards';
import { demandApi, type DemandSignal, type DemandSnapshot } from '@/lib/api/demand';
import { httpErrorStatus } from '@/lib/api/errors';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import {
  countByTab,
  FILTER_TABS,
  matchesTab,
  signalTarget,
  type FilterTab,
} from '@/lib/demand/signals';
import { formatWindowDate } from '@/lib/format';
import { useProjectContext } from '@/lib/project/project-context';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';

const DEMAND_TAB_CODEC = stringUrlCodec(
  FILTER_TABS.map(({ tab }) => tab),
  'all' as FilterTab,
);

const DEMAND_LOADING_METRICS = [
  'latent-demand',
  'striking-distance',
  'cannibalization',
  'ctr-gap',
  'detector-health',
] as const;
const DEMAND_LOADING_SIGNALS = ['signal-a', 'signal-b'] as const;
const DEMAND_LOADING_SIGNAL_METRICS = [
  'signal-impressions',
  'signal-clicks',
  'signal-ctr',
  'signal-position',
] as const;

function DemandLoading() {
  return (
    <Stack gap="workspace" aria-busy="true">
      <output className="sr-only">Loading search demand…</output>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="h-4 w-48 max-w-full" />
        </div>
        <Skeleton className="h-8 w-40 rounded-[var(--radius-control)]" />
      </div>

      <Card>
        <CardContent>
          <Stack gap="workspace">
            <div className="divide-border-subtle grid divide-y sm:grid-cols-2 sm:divide-x-0 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">
              {DEMAND_LOADING_METRICS.map((placeholder) => (
                <div
                  key={placeholder}
                  className="grid gap-2 px-0 py-2.5 sm:px-4 lg:first:ps-0 lg:last:pe-0"
                >
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-20" />
                  <Skeleton className="h-3 w-32 max-w-full" />
                </div>
              ))}
            </div>
            <div className="border-border-subtle grid gap-3 border-t pt-4">
              <Skeleton className="h-4 w-36" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-28 rounded-full" />
                <Skeleton className="h-7 w-32 rounded-full" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
            </div>
          </Stack>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <Skeleton className="h-9 w-full rounded-[var(--radius-control)] sm:w-64" />
      </div>

      <div className="grid gap-3">
        {DEMAND_LOADING_SIGNALS.map((placeholder) => (
          <Card key={placeholder}>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-28 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-2/3" />
                </div>
                <Skeleton className="h-8 w-28 rounded-[var(--radius-control)]" />
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {DEMAND_LOADING_SIGNAL_METRICS.map((metric) => (
                  <div key={metric} className="grid gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </Stack>
  );
}

function SearchDemandView({ snapshot }: Readonly<{ snapshot: DemandSnapshot }>) {
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useUrlState('view', DEMAND_TAB_CODEC, {
    clearKeys: ['signal'],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSignalId, setSelectedSignalId] = useUrlState('signal', optionalStringUrlCodec);
  const selectedSignal = snapshot.signals.find((signal) => signal.id === selectedSignalId) ?? null;

  /**
   * Recompute is a QUEUED job, not a synchronous rebuild: the endpoint returns
   * 202 with `status: queued` and a worker produces the new snapshot later.
   * Refetching on success would therefore just re-read the current snapshot
   * and look like a no-op, so we report that the work was queued and let the
   * user refresh once it lands.
   */
  const recomputeMutation = useMutation({
    mutationFn: () =>
      demandApi.recompute(
        activeProject!.id,
        { window_start: snapshot.window_start, window_end: snapshot.window_end },
        { workspaceId: activeProject!.workspace_id },
      ),
  });

  const refreshSnapshot = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.demand.latest(activeProject?.id) });

  const handleInspect = (signal: DemandSignal) => {
    setSelectedSignalId(signal.id);
  };

  const windowLabel = `${formatWindowDate(snapshot.window_start)} – ${formatWindowDate(snapshot.window_end)}`;

  // Counts for every tab in one pass, recomputed only when the snapshot does —
  // not on every keystroke in the search box.
  const tabCounts = useMemo(
    () => new Map(FILTER_TABS.map(({ tab }) => [tab, countByTab(snapshot.signals, tab)] as const)),
    [snapshot.signals],
  );

  /**
   * The API returns signals ordered by priority, so a signal's rank is its
   * index in the FULL list. Pairing it here keeps the rank stable when a
   * filter hides the signals above it.
   */
  const filteredSignals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return snapshot.signals.reduce<Array<{ signal: DemandSignal; rank: number }>>(
      (matches, signal, index) => {
        if (!matchesTab(signal, activeTab)) return matches;
        if (!query) {
          matches.push({ signal, rank: index + 1 });
          return matches;
        }
        const haystack = [
          signalTarget(signal),
          signal.page_url,
          signal.signal_type.replace(/_/g, ' '),
        ]
          .join(' ')
          .toLowerCase();
        if (haystack.includes(query)) matches.push({ signal, rank: index + 1 });
        return matches;
      },
      [],
    );
  }, [snapshot.signals, activeTab, searchQuery]);

  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <EditorialSectionHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {snapshot.signals.length === 1
                ? '1 demand signal observed'
                : `${snapshot.signals.length} demand signals observed`}
            </span>
            <span className="text-muted inline-flex items-center gap-1 text-xs">
              <Calendar className="size-3.5" aria-hidden="true" />
              {windowLabel}
            </span>
          </span>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => recomputeMutation.mutate()}
            pending={recomputeMutation.isPending}
            pendingLabel="Queueing…"
            className="shrink-0 text-xs"
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Recompute Signals
          </Button>
        }
      />

      {recomputeMutation.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(recomputeMutation.error, {
            action: 'queue the search demand recompute',
          })}
          onRetry={() => recomputeMutation.mutate()}
        />
      ) : null}

      {recomputeMutation.isSuccess ? (
        <Alert tone="info">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {recomputeMutation.data.status === 'already_queued'
                ? 'A recompute for this window is already queued.'
                : 'Recompute queued. Signals refresh once the job finishes.'}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => refreshSnapshot()}>
              Check for the new snapshot
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <Stack gap="workspace">
            <DemandSummaryCards snapshot={snapshot} />
            <DemandDetectorBar snapshot={snapshot} />
          </Stack>
        </CardContent>
      </Card>

      {/* Interactive Filter & Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_TABS.map(({ tab, label }) => {
            const count = tabCounts.get(tab) ?? 0;
            // The optional cohorts stay hidden while empty, but a tab the user
            // has already selected must remain visible to switch away from.
            const optional = tab === 'trends' || tab === 'branded';
            if (optional && count === 0 && activeTab !== tab) return null;
            return (
              <FilterChip
                key={tab}
                active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                count={count}
              >
                {label}
              </FilterChip>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="w-full sm:w-64">
          <SearchField
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Filter queries or URLs..."
            aria-label="Filter queries or URLs"
          />
        </div>
      </div>

      {/* Signals List Feed */}
      {filteredSignals.length > 0 ? (
        <div className="grid gap-3">
          {filteredSignals.map(({ signal, rank }) => (
            <DemandSignalCard
              key={signal.id}
              signal={signal}
              rank={rank}
              onInspect={handleInspect}
            />
          ))}
        </div>
      ) : snapshot.signals.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          heading="No qualifying search gaps observed"
          description="Search Console data was observed, but no configured detector emitted a signal in this window."
        />
      ) : (
        <EmptyState
          icon={Search}
          heading="No signals match your filter"
          description="Try choosing a different filter tab or clearing your search term."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActiveTab('all');
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          }
        />
      )}

      {/* Evidence Inspection Drawer */}
      <DemandEvidenceDrawer
        signal={selectedSignal}
        open={selectedSignal !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSignalId(null);
        }}
      />
    </div>
  );
}

export function DemandProjection() {
  const { activeProject, isLoading: projectLoading } = useProjectContext();
  const latest = useQuery({
    queryKey: queryKeys.demand.latest(activeProject?.id),
    queryFn: ({ signal }) =>
      demandApi.getLatest(activeProject!.id, {
        signal,
        workspaceId: activeProject!.workspace_id,
      }),
    enabled: Boolean(activeProject),
    // Deliberately NO `keepPreviousData`: the key's only variable is the
    // project, so keeping previous data would render the PREVIOUS project's
    // snapshot as a success (placeholder data is not `isLoading`) while
    // `SearchDemandView` recomputes against the CURRENT project id.
  });

  if (projectLoading || latest.isLoading) {
    return <DemandLoading />;
  }
  if (!activeProject) {
    return <Alert tone="info">Select a project to inspect search demand.</Alert>;
  }
  if (latest.isError && httpErrorStatus(latest.error) === 404) {
    return (
      <EmptyState
        icon={Search}
        heading="No Search Demand snapshot yet"
        description="Connect and sync traffic evidence before Search Demand can identify opportunities."
        action={
          <Button asChild size="md">
            <ProjectLink href="/performance">Open Performance</ProjectLink>
          </Button>
        }
      />
    );
  }
  if (latest.isError) {
    return <Alert tone="danger">Search demand could not be loaded.</Alert>;
  }
  if (!latest.data) return null;

  if (latest.data.coverage.search !== 'observed') {
    return (
      <Alert tone="info">
        Search Console evidence is unavailable for this snapshot. Sync Search Console to measure
        search demand.
      </Alert>
    );
  }

  // The route already wraps this subtree in a TooltipProvider.
  return <SearchDemandView snapshot={latest.data} />;
}
