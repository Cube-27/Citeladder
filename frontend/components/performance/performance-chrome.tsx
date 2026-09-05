'use client';

import { ChevronDown, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react';

import { INITIAL_SELECTION, type RangeSelection } from './date-range-dialog';
import type { usePerformanceSync } from './use-performance-sync';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { segmentedItemVariants, segmentedTrackVariants } from '@/components/ui/segmented-variants';
import { Select } from '@/components/ui/select';
import type { PerformanceGranularity } from '@/lib/api/performance';
import { GRANULARITY_OPTIONS, QUICK_RANGE_OPTIONS } from '@/lib/performance/performance';
import { cn } from '@/lib/utils';

/**
 * The Performance surface's chrome: the control bar above the cards, the
 * chart's bucket-size select, and the notice stack.
 *
 * Split from `performance-screen.tsx` to keep that module inside the 500-LOC
 * budget. These are presentation only — every piece of state they render is
 * owned by the screen and passed in.
 */

function getMoreLabel(selection: RangeSelection, comparing: boolean): string {
  if (comparing) return 'Compare';
  if (selection.range === '3_months') return '3 months';
  if (selection.range === '6_months') return '6 months';
  if (selection.range === 'last_synced') return 'Last synced';
  if (selection.range === 'custom') return 'Custom';
  return 'More';
}

/** The dashboard's control bar: resolved range, imported coverage, and sync. */
export function PerformanceToolbar({
  selection,
  selectedLabel,
  latestDate,
  hasConnections,
  sync,
  onOpenRange,
  onOpenCompare,
  onSelectRange,
  comparing,
  onReset,
}: Readonly<{
  selection: RangeSelection;
  selectedLabel: string;
  latestDate: string | null;
  hasConnections: boolean;
  sync: ReturnType<typeof usePerformanceSync>;
  onOpenRange: () => void;
  onOpenCompare: () => void;
  onSelectRange: (next: RangeSelection) => void;
  /** True while a comparison is active — the button's and Reset's state. */
  comparing: boolean;
  onReset: () => void;
}>) {
  const moreLabel = getMoreLabel(selection, comparing);
  const isMoreActive =
    comparing ||
    selection.range === '3_months' ||
    selection.range === '6_months' ||
    selection.range === 'last_synced' ||
    selection.range === 'custom';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Quick-select buttons: Day, Week, Month, and dynamic More button
          (showing 3 months, 6 months, Last synced default, or Compare). */}
      <fieldset
        className={cn(segmentedTrackVariants(), 'm-0 border-0 p-0')}
        aria-label="Date range"
      >
        {QUICK_RANGE_OPTIONS.map((option) => {
          const isSelected = !comparing && selection.range === option.value;
          return (
            <Pressable
              key={option.value}
              type="button"
              className={segmentedItemVariants({ selected: isSelected })}
              aria-pressed={isSelected}
              onClick={() => onSelectRange({ ...INITIAL_SELECTION, range: option.value })}
            >
              {option.label}
            </Pressable>
          );
        })}
        <Pressable
          type="button"
          className={cn(segmentedItemVariants({ selected: isMoreActive }), 'gap-1')}
          aria-pressed={isMoreActive}
          data-testid="compare-button"
          onClick={comparing ? onOpenCompare : onOpenRange}
        >
          {moreLabel}
          <ChevronDown className="size-3.5 opacity-70" aria-hidden />
        </Pressable>
      </fieldset>

      <span className="text-muted text-sm" data-testid="performance-window">
        {selectedLabel}
      </span>
      {/* Reset belongs to the comparison: it is what returns "Compare" to
          "More". With no comparison active there is nothing it would undo. */}
      {comparing ? (
        <Button variant="ghost" size="sm" onClick={onReset} data-testid="reset-filters-button">
          <RotateCcw className="size-4" aria-hidden />
          Reset filters
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-muted text-xs">
          {latestDate ? `Data through ${latestDate}` : 'No imported history'}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => sync.mutation.mutate()}
          disabled={!hasConnections || sync.syncing || sync.mutation.isPending}
          data-testid="sync-now-button"
        >
          {sync.syncing || sync.mutation.isPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Syncing…
            </>
          ) : (
            <>
              <RefreshCw className="size-4" aria-hidden />
              Sync now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * The chart's bucket-size control, at the plot's top-right.
 *
 * Deliberately NOT in the toolbar with the range quick-selects: the range
 * picks which window is charted, this picks how that window is bucketed, and
 * putting both in one row invites reading them as the same control (they
 * even share the words day/week/month).
 */
export function GranularitySelect({
  value,
  onChange,
}: Readonly<{
  value: PerformanceGranularity;
  onChange: (next: PerformanceGranularity) => void;
}>) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      options={GRANULARITY_OPTIONS}
      ariaLabel="Chart bucket size"
      className="w-36"
    />
  );
}

export function PerformanceNotices({
  sync,
  projecting,
  selectedMissing,
  comparisonMissing,
}: Readonly<{
  sync: ReturnType<typeof usePerformanceSync>;
  projecting: boolean;
  selectedMissing: boolean;
  comparisonMissing: boolean;
}>) {
  return (
    <>
      {sync.syncing ? (
        <Alert tone="info" hideIcon>
          <span className="flex items-center gap-2" data-testid="sync-status-banner">
            <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
            <span>
              Sync in progress — importing the dates not yet covered. Charts and tables update when
              it completes.
            </span>
          </span>
        </Alert>
      ) : null}
      {sync.notice ? <Alert tone="info">{sync.notice}</Alert> : null}
      {sync.outcome === 'failed' ? (
        <Alert tone="warning">
          Sync finished with errors — previously imported data is unchanged. Check Settings →
          Integrations for details.
        </Alert>
      ) : null}
      {projecting ? <Alert tone="info">Building this range from imported data…</Alert> : null}
      {!projecting && selectedMissing ? (
        <Alert tone="info">
          No imported data covers this range yet. Sync to import it, or choose a range inside the
          covered history.
        </Alert>
      ) : null}
      {!projecting && comparisonMissing ? (
        <Alert tone="info">
          The comparison period has no imported data, so its columns show as not measured.
        </Alert>
      ) : null}
    </>
  );
}
