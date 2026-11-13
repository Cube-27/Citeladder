import type { ReactNode } from 'react';
import { Search, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { QueryState } from '@/components/ui/query-state';
import { DemandSignalTable } from '@/components/demand/demand-signal-table';
import type { DemandSignal } from '@/lib/api/demand';
import type { FilterTab, RankedSignal } from '@/lib/demand/signals';

/**
 * The signal table, or why it is empty. An empty feed has two different
 * causes, and they need different words: nothing was detected at all, or the
 * filter hid everything that was.
 */
export function DemandSignalsFeed({
  filteredSignals,
  signalCount,
  activeTab,
  searchQuery,
  onClearFilters,
  onInspect,
}: Readonly<{
  filteredSignals: RankedSignal[];
  signalCount: number;
  activeTab: FilterTab;
  searchQuery: string;
  onClearFilters: () => void;
  onInspect: (signal: DemandSignal) => void;
}>) {
  let signalsFeed: ReactNode = (
    <QueryState
      kind="empty"
      icon={Search}
      heading="No signals match your filter"
      description="Try choosing a different filter tab or clearing your search term."
      action={
        <Button variant="secondary" onClick={onClearFilters}>
          Clear filters
        </Button>
      }
    />
  );
  if (filteredSignals.length > 0) {
    signalsFeed = (
      <DemandSignalTable
        rows={filteredSignals}
        filterKey={`${activeTab}\u0000${searchQuery.trim().toLowerCase()}`}
        onInspect={onInspect}
      />
    );
  } else if (signalCount === 0) {
    signalsFeed = (
      <QueryState
        kind="empty"
        icon={Sparkles}
        heading="No qualifying search gaps observed"
        description="Search Console data was observed, but no configured detector emitted a signal in this window."
      />
    );
  }
  return signalsFeed;
}
