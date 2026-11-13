import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Calendar, Search } from 'lucide-react';

import { ListScreen } from '@/components/layout/page-shell';
import { QueryState } from '@/components/ui/query-state';
import { ReadError, readErrorProps } from '@/components/ui/read-error';
import { SearchField } from '@/components/ui/search-field';
import { DemandEvidenceDrawer } from '@/components/demand/demand-evidence-drawer';
import { DemandLatentDemand } from '@/components/demand/demand-latent-demand';
import {
  RecomputeAction,
  RecomputeFailure,
  RecomputeStatus,
} from '@/components/demand/demand-recompute';
import { DemandDataCaveats, DemandSignalFilters } from '@/components/demand/demand-signal-filters';
import { SignalLegend } from '@/components/demand/demand-signal-table';
import { DemandSignalsFeed } from '@/components/demand/demand-signals-feed';
import {
  demandMutations,
  demandQueries,
  refreshDemandSnapshot,
  type DemandSignal,
  type DemandSnapshot,
} from '@/lib/api/demand';
import {
  countByTab,
  FILTER_TABS,
  matchesTab,
  signalTarget,
  type FilterTab,
  type RankedSignal,
} from '@/lib/demand/signals';
import { formatCount, formatWindowDate } from '@/lib/format';
import { InlineFigure } from '@/components/ui/typography';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
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
  const { workspaceId, projectId } = useProjectScope();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useUrlState('view', DEMAND_TAB_CODEC, {
    clearKeys: ['signal'],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSignalId, setSelectedSignalId] = useUrlState('signal', optionalStringUrlCodec);
  const selectedSignal = snapshot.signals.find((signal) => signal.id === selectedSignalId) ?? null;

  // Recompute is queued: the screen reports that the work was queued and lets
  // the reader check for the new snapshot once it lands.
  const recomputeMutation = useMutation(demandMutations.recompute({ workspaceId, projectId }));
  const canRun = useWorkspaceCapability('run');
  const refreshSnapshot = () => refreshDemandSnapshot(queryClient, projectId);

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
        signal.signal_type.replaceAll('_', ' '),
      ]
        .join(' ')
        .toLowerCase();
      if (haystack.includes(query)) matches.push({ signal, rank: index + 1 });
      return matches;
    }, []);
  }, [snapshot.signals, activeTab, searchQuery]);

  return (
    <ListScreen
      actions={
        // Recomputing is a run; a role without it reads the snapshot as is.
        canRun ? (
          <RecomputeAction
            mutation={recomputeMutation}
            onRecompute={() =>
              recomputeMutation.mutate({
                window_start: snapshot.window_start,
                window_end: snapshot.window_end,
              })
            }
            onCheck={() => {
              recomputeMutation.reset();
              void refreshSnapshot();
            }}
          />
        ) : undefined
      }
      controls={{
        // Which signals the table lists is the row's view; it leads.
        view: (
          <DemandSignalFilters
            snapshot={snapshot}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabCounts={tabCounts}
          />
        ),
        search: (
          <SearchField
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Filter queries or pages…"
            aria-label="Filter queries or pages"
          />
        ),
        // What the table holds, and over which window, closes the row.
        status: (
          <>
            <span>
              <InlineFigure>{formatCount(snapshot.signals.length)}</InlineFigure>
              {snapshot.signals.length === 1 ? ' signal observed' : ' signals observed'}
            </span>
            <Inline as="span" gap="tight">
              <Icon icon={Calendar} />
              {windowLabel}
            </Inline>
            <DemandLatentDemand snapshot={snapshot} />
          </>
        ),
      }}
    >
      <>
        {refreshError ? (
          <ReadError
            error={refreshError}
            fallback="Search demand could not be refreshed."
            onRetry={onRetry ?? (() => undefined)}
            pending={Boolean(retrying)}
          />
        ) : null}
        <RecomputeFailure mutation={recomputeMutation} />
        {/* What the figures mean, then the table the control row narrows.
            A queued recompute rides this line and the header button. */}
        <Stack>
          <Inline as="p" gap="meta">
            <SignalLegend signals={snapshot.signals} policy={snapshot.detector_policy} />
            <DemandDataCaveats snapshot={snapshot} />
            <RecomputeStatus mutation={recomputeMutation} />
          </Inline>
          <DemandSignalsFeed
            filteredSignals={filteredSignals}
            signalCount={snapshot.signals.length}
            activeTab={activeTab}
            searchQuery={searchQuery}
            onClearFilters={() => {
              setActiveTab('all');
              setSearchQuery('');
            }}
            onInspect={handleInspect}
          />
        </Stack>

        <DemandEvidenceDrawer
          signal={selectedSignal}
          policy={snapshot.detector_policy}
          open={selectedSignal !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedSignalId(null);
          }}
        />
      </>
    </ListScreen>
  );
}

export function DemandProjection() {
  const { workspaceId, projectId } = useProjectScope();
  const latest = useQuery({
    ...demandQueries.latest({ workspaceId, projectId }),
    // Deliberately NO `keepPreviousData`: the key's only variable is the
    // project, so keeping previous data would render the PREVIOUS project's
    // snapshot as a success (placeholder data is not `isLoading`) while
    // `SearchDemandView` recomputes against the CURRENT project id.
  });

  // The loaded view owns its own bands. Every other state is the same page
  // with an empty content region, so it keeps its identity band rather than
  // losing the heading and the rule above the work.
  const snapshot = latest.data;
  if (snapshot?.coverage.search === 'observed') {
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
  return <ListScreen>{demandFallback(latest)}</ListScreen>;
}

/** Every non-loaded state of `/demand`, in the order it is decided. */
function demandFallback(latest: UseQueryResult<DemandSnapshot | null, Error>) {
  if (latest.isLoading) return <QueryState kind="loading" label="Loading search demand…" />;
  if (latest.data === null) return <SearchConsoleSetup />;
  if (latest.isError)
    return (
      <QueryState
        kind="error"
        {...readErrorProps(latest)}
        fallback="Search demand could not be loaded. Check your connection and try again."
      />
    );
  if (latest.data === undefined) return null;
  return <SearchConsoleSetup />;
}

/** No usable Search Console evidence yet: connect it, or wait for its import. */
function SearchConsoleSetup() {
  return (
    <DataSourceSetup
      required={['gsc']}
      title="Connect Search Console"
      whenReady={
        <QueryState
          kind="empty"
          icon={Search}
          heading="Search Demand appears after the next Search Console import"
        />
      }
    />
  );
}
