'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Calendar, RefreshCw, Search, Sparkles } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FilterChip } from '@/components/ui/filter-chip';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { SearchField } from '@/components/ui/search-field';
import { FilterRow } from '@/components/ui/filter-row';
import { ProjectRequiredState } from '@/components/layout/project-required-state';
import { PageLoading } from '@/components/layout/page-loading';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { PageShell } from '@/components/layout/page-shell';
import { ReadError, readErrorProps } from '@/components/ui/read-error';
import { DemandActBand } from '@/components/demand/demand-act-band';
import { DemandDetectorBar } from '@/components/demand/demand-detector-bar';
import { DemandEvidenceDrawer } from '@/components/demand/demand-evidence-drawer';
import { DemandSignalTable, SignalLegend } from '@/components/demand/demand-signal-table';
import { DemandSummaryCards } from '@/components/demand/demand-summary-cards';
import { demandApi, type DemandSignal, type DemandSnapshot } from '@/lib/api/demand';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import { latestDemandSnapshotQuery } from '@/lib/demand/latest-snapshot';
import {
  countByTab,
  FILTER_TABS,
  matchesTab,
  signalTarget,
  type FilterTab,
  type RankedSignal,
} from '@/lib/demand/signals';
import { formatWindowDate } from '@/lib/format';
import { useProjectContext } from '@/lib/project/project-context';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Stack } from '@/components/ui/layout';
import { DataSourceSetup } from '@/components/integrations/data-source-setup';

const DEMAND_TAB_CODEC = stringUrlCodec(
  FILTER_TABS.map(({ tab }) => tab),
  'all' as FilterTab,
);

function SearchDemandView({
  snapshot,
  refreshError,
  onRetry,
  retrying,
}: Readonly<{
  snapshot: DemandSnapshot;
  refreshError?: Error | null;
  onRetry?: () => void;
  retrying?: boolean;
}>) {
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
    return snapshot.signals.reduce<RankedSignal[]>((matches, signal, index) => {
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
    }, []);
  }, [snapshot.signals, activeTab, searchQuery]);

  // An empty feed has two different causes, and they need different words:
  // nothing was detected at all, or the filter hid everything that was.
  let signalsFeed: ReactNode = (
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
  );
  if (filteredSignals.length > 0) {
    signalsFeed = (
      <Stack gap="compact">
        <SignalLegend signals={filteredSignals.map(({ signal }) => signal)} />
        <DemandSignalTable rows={filteredSignals} onInspect={handleInspect} />
      </Stack>
    );
  } else if (snapshot.signals.length === 0) {
    signalsFeed = (
      <EmptyState
        icon={Sparkles}
        heading="No qualifying search gaps observed"
        description="Search Console data was observed, but no configured detector emitted a signal in this window."
      />
    );
  }

  return (
    <PageShell
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => recomputeMutation.mutate()}
          pending={recomputeMutation.isPending}
          pendingLabel="Queueing…"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Recompute signals
        </Button>
      }
      controls={
        <FilterRow
          search={
            <SearchField
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Filter queries or URLs..."
              aria-label="Filter queries or URLs"
            />
          }
        >
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
        </FilterRow>
      }
    >
      <Stack gap="workspace">
        {refreshError ? (
          <ReadError
            error={refreshError}
            fallback="Search demand could not be refreshed."
            onRetry={onRetry ?? (() => undefined)}
            pending={Boolean(retrying)}
          />
        ) : null}
        <EditorialSectionHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>
                {snapshot.signals.length === 1
                  ? '1 demand signal observed'
                  : `${snapshot.signals.length} demand signals observed`}
              </span>
              <span className="type-caption inline-flex items-center gap-1">
                <Calendar className="size-3.5" aria-hidden="true" />
                {windowLabel}
              </span>
            </span>
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

        <DemandActBand signals={snapshot.signals} />

        {signalsFeed}

        {/* Evidence Inspection Drawer */}
        <DemandEvidenceDrawer
          signal={selectedSignal}
          open={selectedSignal !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedSignalId(null);
          }}
        />
      </Stack>
    </PageShell>
  );
}

export function DemandProjection() {
  const { activeProject, isLoading: projectLoading } = useProjectContext();
  const latest = useQuery({
    ...latestDemandSnapshotQuery(activeProject?.id ?? '', activeProject?.workspace_id ?? null),
    enabled: Boolean(activeProject),
    // Deliberately NO `keepPreviousData`: the key's only variable is the
    // project, so keeping previous data would render the PREVIOUS project's
    // snapshot as a success (placeholder data is not `isLoading`) while
    // `SearchDemandView` recomputes against the CURRENT project id.
  });

  // The loaded view owns its own bands. Every other state is the same page
  // with an empty content region, so it keeps its identity band rather than
  // losing the heading and the rule above the work.
  const snapshot = latest.data;
  if (activeProject && snapshot?.coverage.search === 'observed') {
    // The route already wraps this subtree in a TooltipProvider.
    //
    // A refresh that fails over evidence we already hold keeps the evidence and
    // says so. Returning the error instead would blank a working screen; saying
    // nothing would present a stale snapshot as current.
    return (
      <SearchDemandView
        snapshot={snapshot}
        refreshError={latest.error}
        onRetry={() => void latest.refetch()}
        retrying={latest.isFetching}
      />
    );
  }
  return (
    <PageShell>
      {demandFallback({
        projectLoading,
        hasProject: Boolean(activeProject),
        latest,
      })}
    </PageShell>
  );
}

/** Every non-loaded state of `/demand`, in the order it is decided. */
function demandFallback({
  projectLoading,
  hasProject,
  latest,
}: Readonly<{
  projectLoading: boolean;
  hasProject: boolean;
  latest: UseQueryResult<DemandSnapshot | null, Error>;
}>) {
  if (projectLoading || latest.isLoading) return <PageLoading label="Loading search demand…" />;
  if (!hasProject) return <ProjectRequiredState />;
  if (latest.data === null) {
    return (
      <Stack gap="workspace">
        <DataSourceSetup
          required={['gsc']}
          title="Connect Search Console"
          description="Search Demand finds opportunities in this project's own search queries. Connect Google and use the property for this site."
        />
        <EmptyState
          icon={Search}
          heading="No Search Demand snapshot yet"
          description="Search Demand appears here once Search Console data has been imported and analysed."
        />
      </Stack>
    );
  }
  if (latest.isError)
    return (
      <ReadError
        {...readErrorProps(latest)}
        fallback="Search demand could not be loaded. Check your connection and try again."
      />
    );
  if (latest.data === undefined) return null;
  return (
    <Stack gap="workspace">
      <DataSourceSetup
        required={['gsc']}
        title="Connect Search Console"
        description="This snapshot has no Search Console evidence. Connect Google and use the property for this site."
      />
      <Alert tone="info">
        Search Console evidence is unavailable for this snapshot. Search Demand refreshes after the
        next Search Console import.
      </Alert>
    </Stack>
  );
}
