import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { RESERVED_CONTROLS } from '@/components/layout/page-shell';
import type { FilterBarProps } from '@/components/ui/filter-bar';
import { SearchField } from '@/components/ui/search-field';
import { DemandEvidenceDrawer } from '@/components/demand/demand-evidence-drawer';
import { DemandLatentDemand } from '@/components/demand/demand-latent-demand';
import { DemandSignalFilters } from '@/components/demand/demand-signal-filters';
import { DemandSignalTable, SIGNAL_COLUMN_COUNT } from '@/components/demand/demand-signal-table';
import { demandQueries, type DemandSignal, type DemandSnapshot } from '@/lib/api/demand';
import { Search, Sparkles } from '@/lib/icons';
import {
  countByTab,
  FILTER_TABS,
  matchesTab,
  signalTarget,
  type FilterTab,
  type RankedSignal,
} from '@/lib/demand/signals';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { DataSourceSetup } from '@/components/integrations/data-source-setup';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';

const DEMAND_TAB_CODEC = stringUrlCodec<FilterTab>(
  FILTER_TABS.map(({ tab }) => tab),
  'all',
);

function DemandEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return <Section>{children}</Section>;
}

export function useDemand() {
  const { workspaceId, projectId } = useProjectScope();
  const latest = useQuery({
    ...demandQueries.latest({ workspaceId, projectId }),
  });
  const [activeTab, setActiveTab] = useUrlState('view', DEMAND_TAB_CODEC, {
    clearKeys: ['signal'],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSignalId, setSelectedSignalId] = useUrlState('signal', optionalStringUrlCodec);
  const snapshot = latest.data?.coverage.search === 'observed' ? latest.data : null;
  const signals = snapshot?.signals;
  const tabCounts = useMemo(
    () => new Map(FILTER_TABS.map(({ tab }) => [tab, countByTab(signals ?? [], tab)] as const)),
    [signals],
  );
  const filteredSignals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (signals ?? []).reduce<RankedSignal[]>((matches, signal, index) => {
      if (!matchesTab(signal, activeTab)) return matches;
      const haystack = [
        signalTarget(signal),
        signal.page_url,
        signal.signal_type.replaceAll('_', ' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!query || haystack.includes(query)) matches.push({ signal, rank: index + 1 });
      return matches;
    }, []);
  }, [signals, activeTab, searchQuery]);
  return {
    latest,
    snapshot,
    filter: { activeTab, setActiveTab, searchQuery, setSearchQuery, tabCounts, filteredSignals },
    selection: { selectedSignalId, setSelectedSignalId },
  };
}

type Demand = ReturnType<typeof useDemand>;

export function demandControls(demand: Demand): FilterBarProps | undefined {
  const { snapshot, filter } = demand;
  if (!snapshot) return demand.latest.isLoading ? RESERVED_CONTROLS : undefined;
  return {
    view: (
      <DemandSignalFilters
        activeTab={filter.activeTab}
        onTabChange={filter.setActiveTab}
        tabCounts={filter.tabCounts}
      />
    ),
    status: <DemandLatentDemand snapshot={snapshot} />,
  };
}

export function DemandPanel({ demand }: Readonly<{ demand: Demand }>) {
  const { latest, snapshot } = demand;
  if (!snapshot) return demandFallback(latest);
  return (
    <>
      {latest.error ? (
        <Notice
          kind="read"
          error={latest.error}
          fallback="Demand could not be refreshed."
          title="Demand could not be refreshed"
          onRetry={() => void latest.refetch()}
          pending={latest.isFetching}
        />
      ) : null}
      <SignalsFeed demand={demand} snapshot={snapshot} />
    </>
  );
}

function SignalsFeed({
  demand: { filter, selection },
  snapshot,
}: Readonly<{ demand: Demand; snapshot: DemandSnapshot }>) {
  const selectedSignal =
    snapshot.signals.find((signal) => signal.id === selection.selectedSignalId) ?? null;
  return (
    <>
      {snapshot.signals.length === 0 ? (
        <DemandEmpty>
          <StateBlock
            kind="empty"
            icon={Sparkles}
            heading="No qualifying search gaps observed"
            headingLevel={2}
          />
        </DemandEmpty>
      ) : (
        <DemandSignalTable
          rows={filter.filteredSignals}
          filterKey={`${filter.activeTab}\u0000${filter.searchQuery.trim().toLowerCase()}`}
          search={
            <SearchField
              value={filter.searchQuery}
              onValueChange={filter.setSearchQuery}
              placeholder="Filter queries or pages…"
              aria-label="Filter queries or pages"
            />
          }
          onInspect={(signal: DemandSignal) => selection.setSelectedSignalId(signal.id)}
          onClearFilters={() => {
            filter.setActiveTab('all');
            filter.setSearchQuery('');
          }}
        />
      )}
      <DemandEvidenceDrawer
        signal={selectedSignal}
        policy={snapshot.detector_policy}
        open={selectedSignal !== null}
        onOpenChange={(open) => {
          if (!open) selection.setSelectedSignalId(null);
        }}
      />
    </>
  );
}

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
        fallback="Demand could not be loaded. The request failed or timed out."
        title="Demand could not be loaded"
      />
    );
  if (latest.data === undefined) return null;
  return <SearchConsoleSetup />;
}

function SearchConsoleSetup() {
  return (
    <DataSourceSetup
      required={['gsc']}
      title="Connect Search Console"
      unconnected={{
        icon: Search,
        heading: 'Connect Search Console',
        connect: 'Connect Search Console',
      }}
      whenReady={
        <DemandEmpty>
          <StateBlock
            kind="empty"
            icon={Search}
            heading="Demand appears after the next Search Console import"
            headingLevel={2}
          />
        </DemandEmpty>
      }
    />
  );
}
