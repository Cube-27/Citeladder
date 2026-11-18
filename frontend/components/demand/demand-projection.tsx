import { useMemo, useState, type ReactNode } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { Calendar, RefreshCw, Search, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { RESERVED_CONTROLS } from '@/components/layout/page-shell';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar } from '@/components/ui/filter-bar';
import { SearchField } from '@/components/ui/search-field';
import { DemandEvidenceDrawer } from '@/components/demand/demand-evidence-drawer';
import { DemandLatentDemand } from '@/components/demand/demand-latent-demand';
import {
  DemandDataCaveats,
  DemandDetectorCoverage,
  DemandSignalFilters,
} from '@/components/demand/demand-signal-filters';
import {
  DemandSignalTable,
  SIGNAL_COLUMN_COUNT,
  SignalLegend,
} from '@/components/demand/demand-signal-table';
import {
  demandMutations,
  demandQueries,
  refreshDemandSnapshot,
  type demandApi,
  type DemandSignal,
  type DemandSnapshot,
} from '@/lib/api/demand';
import type { DemandRecomputeRequest } from '@citeladder/contracts/demand';
import { isTransientMutationError, mutationNoticeForError } from '@/lib/api/mutation-notice';
import {
  countByTab,
  FILTER_TABS,
  matchesTab,
  signalTarget,
  type FilterTab,
  type RankedSignal,
} from '@/lib/demand/signals';
import { formatCount, formatStripDay } from '@/lib/format';
import { InlineFigure } from '@/components/ui/typography';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { DataSourceSetup } from '@/components/integrations/data-source-setup';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';

const DEMAND_TAB_CODEC = stringUrlCodec(
  FILTER_TABS.map(({ tab }) => tab),
  'all' as FilterTab,
);

type RecomputeMutation = UseMutationResult<
  Awaited<ReturnType<typeof demandApi.recompute>>,
  Error,
  DemandRecomputeRequest
>;

/**
 * The header's one recompute button, which becomes the next step in place:
 * once queued it checks for the new snapshot; after a transient failure it
 * retries. The button keeps its slot, so the page never moves.
 */
function RecomputeAction({
  mutation,
  onRecompute,
  onCheck,
}: Readonly<{ mutation: RecomputeMutation; onRecompute: () => void; onCheck: () => void }>) {
  if (mutation.isSuccess)
    return (
      <Button variant="secondary" onClick={onCheck}>
        <Icon icon={RefreshCw} />
        Check for new snapshot
      </Button>
    );
  const retry = mutation.isError && isTransientMutationError(mutation.error);
  return (
    <Button
      variant="secondary"
      onClick={onRecompute}
      pending={mutation.isPending}
      pendingLabel="Queueing…"
    >
      <Icon icon={RefreshCw} />
      {retry ? 'Try again' : 'Recompute signals'}
    </Button>
  );
}

/** Recompute's outcome as an info notice; the header button checks for the new snapshot. */
function RecomputeStatus({ mutation }: Readonly<{ mutation: RecomputeMutation }>) {
  if (mutation.isSuccess)
    return (
      <Notice tone="info">
        {mutation.data.status === 'already_queued'
          ? 'A recompute for this window is already queued.'
          : 'Recompute queued. Signals refresh once the job finishes.'}
      </Notice>
    );
  return null;
}

/**
 * The card a Search Demand region's state sits in, its headline the card's
 * h2. Keyword Research lays out its tab states the same way.
 */
function DemandEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Section>
      <Stack>{children}</Stack>
    </Section>
  );
}

/** A failed recompute as the shared notice; the header button is its retry. */
function RecomputeFailure({ mutation }: Readonly<{ mutation: RecomputeMutation }>) {
  if (!mutation.isError) return null;
  return (
    <Notice
      kind="mutation"
      notice={mutationNoticeForError(mutation.error, {
        action: 'queue the search demand recompute',
      })}
    />
  );
}

function SearchDemandView({
  tabs,
  snapshot,
  refreshError,
  onRetry,
  retrying,
}: Readonly<{
  tabs: ReactNode;
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

  const windowLabel = `${formatStripDay(snapshot.window_start)} – ${formatStripDay(snapshot.window_end)}`;

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

  // What the figures mean, and how far each detector ran: the table's caption,
  // and the reason an empty snapshot is empty.
  const caption = (
    <Inline as="span" gap="meta">
      <SignalLegend signals={snapshot.signals} policy={snapshot.detector_policy} />
      <DemandDataCaveats snapshot={snapshot} />
      <DemandDetectorCoverage snapshot={snapshot} />
    </Inline>
  );
  // An empty feed has two different causes, and they need different words:
  // nothing was detected at all, or the filter hid everything that was.
  const signalsFeed: ReactNode =
    snapshot.signals.length === 0 ? (
      <DemandEmpty>
        <StateBlock
          kind="empty"
          icon={Sparkles}
          heading="No qualifying search gaps observed"
          description="Search Console data was observed, but no configured detector emitted a signal in this window."
          headingLevel={2}
        />
        <p className="type-caption">{caption}</p>
      </DemandEmpty>
    ) : (
      <DemandSignalTable
        rows={filteredSignals}
        filterKey={`${activeTab}\u0000${searchQuery.trim().toLowerCase()}`}
        onInspect={handleInspect}
        description={caption}
        onClearFilters={() => {
          setActiveTab('all');
          setSearchQuery('');
        }}
      />
    );

  return (
    <ReportPage
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
      tabs={tabs}
      filters={
        <FilterBar
          // Which signals the table lists is the tab's view, leading its control strip.
          view={
            <DemandSignalFilters
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tabCounts={tabCounts}
            />
          }
          search={
            <SearchField
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Filter queries or pages…"
              aria-label="Filter queries or pages"
            />
          }
          // What the table holds, and over which window, closes the row.
          status={
            // Below 900 each piece wraps to its own line, never overprinting; from 900 the strip's meta is one line.
            <Inline
              as="span"
              gap="status"
              data-demand-status=""
              className="rail:flex-nowrap rail:whitespace-nowrap items-baseline whitespace-normal"
            >
              <span>
                <InlineFigure>{formatCount(snapshot.signals.length)}</InlineFigure>
                {snapshot.signals.length === 1 ? ' signal observed' : ' signals observed'}
              </span>
              <Inline as="span" gap="tight" className="shrink-0">
                <Icon icon={Calendar} />
                <span className="tabular-nums">{windowLabel}</span>
              </Inline>
              <DemandLatentDemand snapshot={snapshot} />
            </Inline>
          }
        />
      }
    >
      <>
        {refreshError ? (
          <Notice
            kind="read"
            error={refreshError}
            fallback="Demand could not be refreshed."
            title="Demand could not be refreshed"
            onRetry={onRetry ?? (() => undefined)}
            pending={Boolean(retrying)}
          />
        ) : null}
        <RecomputeFailure mutation={recomputeMutation} />
        <RecomputeStatus mutation={recomputeMutation} />
        {signalsFeed}

        <DemandEvidenceDrawer
          signal={selectedSignal}
          policy={snapshot.detector_policy}
          open={selectedSignal !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedSignalId(null);
          }}
        />
      </>
    </ReportPage>
  );
}

/** The Keywords page's Demand tab; `tabs` is the page's tab row, kept in every state. */
export function DemandProjection({ tabs }: Readonly<{ tabs: ReactNode }>) {
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
        tabs={tabs}
        snapshot={snapshot}
        refreshError={latest.error}
        onRetry={() => void latest.refetch()}
        retrying={latest.isFetching}
      />
    );
  }
  // The first load holds the control strip, so the table starts where it lands.
  return (
    <ReportPage
      tabs={tabs}
      filters={latest.isLoading ? <FilterBar {...RESERVED_CONTROLS} /> : undefined}
    >
      {demandFallback(latest)}
    </ReportPage>
  );
}

/** Every non-loaded state of the Demand tab, in the order it is decided. */
function demandFallback(latest: UseQueryResult<DemandSnapshot | null, Error>) {
  if (latest.isLoading)
    return (
      <Section>
        <Skeleton variant="table" columns={SIGNAL_COLUMN_COUNT} label="Loading search demand…" />
      </Section>
    );
  if (latest.data === null) return <SearchConsoleSetup />;
  if (latest.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(latest)}
        fallback="Demand could not be loaded. Check your connection and try again."
        title="Demand could not be loaded"
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
      unconnected={{
        icon: Search,
        heading: 'Connect Search Console to see search demand',
        description:
          'Demand shows the queries people search around your offerings, with clicks and impressions, once Search Console is connected.',
      }}
      whenReady={
        <DemandEmpty>
          <StateBlock
            kind="empty"
            icon={Search}
            heading="Demand appears after the next Search Console import"
            description="Queries and pages where search demand outruns your clicks are listed here once Search Console has imported a window."
            headingLevel={2}
          />
        </DemandEmpty>
      }
    />
  );
}
