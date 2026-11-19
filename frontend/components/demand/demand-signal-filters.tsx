import { InfoHint } from '@/components/ui/info-hint';
import { Inline } from '@/components/ui/layout';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/tabs';
import type { DemandDetectorState } from '@citeladder/contracts';
import type { DemandSnapshot } from '@/lib/api/demand';
import { DEMAND_DETECTORS } from '@/lib/config/demand';
import { availabilityLabel } from '@/lib/format';
import { FILTER_TABS, type FilterTab } from '@/lib/demand/signals';

/** A detector's state in words, or null when it ran in full. */
function detectorStatus(state: DemandDetectorState): string | null {
  switch (state) {
    case 'available':
      return null;
    case 'partial':
      return 'Partial';
    case 'insufficient_history':
      return 'Needs more history';
    case 'unavailable':
      return availabilityLabel('unavailable');
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

type Detector = (typeof DEMAND_DETECTORS)[number];

/**
 * The filter in the signals table's control band: one `SegmentedControl`,
 * the same status filter every screen uses. Each choice carries only its
 * label and count, so every filter fits the strip at 982; how far each
 * detector ran is one fact on the summary line (`DemandDetectorCoverage`).
 */
export function DemandSignalFilters({
  activeTab,
  onTabChange,
  tabCounts,
}: Readonly<{
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  tabCounts: ReadonlyMap<FilterTab, number>;
}>) {
  const options = FILTER_TABS.flatMap(({ tab, label }): SegmentedOption<FilterTab>[] => {
    const count = tabCounts.get(tab) ?? 0;
    // Branded stays hidden while empty, but a tab the user has already
    // selected must remain visible to switch away from.
    if (tab === 'branded' && count === 0 && activeTab !== tab) return [];
    return [{ value: tab, label, count }];
  });

  return (
    <SegmentedControl
      value={activeTab}
      onChange={onTabChange}
      options={options}
      ariaLabel="Signal type"
    />
  );
}

/**
 * The detectors that did not run in full, named by status on the summary
 * line ("Partial: Striking distance, CTR gap"), and one hint with every
 * detector's rule and what limited it.
 */
export function DemandDetectorCoverage({ snapshot }: Readonly<{ snapshot: DemandSnapshot }>) {
  const states = snapshot.summary.detectors;
  const byStatus = new Map<string, Detector[]>();
  for (const detector of DEMAND_DETECTORS) {
    const status = detectorStatus(states[detector.key].state);
    if (status) byStatus.set(status, [...(byStatus.get(status) ?? []), detector]);
  }
  return (
    <Inline as="span" gap="tight">
      {byStatus.size === 0
        ? null
        : [...byStatus]
            .map(([status, detectors]) => `${status}: ${detectors.map((d) => d.label).join(', ')}`)
            .join(' · ')}
      <InfoHint label="How each detector works">
        {DEMAND_DETECTORS.map((detector) => (
          <span key={detector.key} className="block">
            {[
              `${detector.label}: ${detector.rule(snapshot.detector_policy)}`,
              ...states[detector.key].limitations,
            ].join(' ')}
          </span>
        ))}
      </InfoHint>
    </Inline>
  );
}

/**
 * Data caveats shared by the signals, behind one hint on the summary line:
 * at the end of the filter strip it sat beside the last filter's own hint
 * and read as a second hint for that filter.
 */
export function DemandDataCaveats({ snapshot }: Readonly<{ snapshot: DemandSnapshot }>) {
  const limitations = Array.from(
    new Set(snapshot.signals.flatMap((signal) => signal.limitations).filter(Boolean)),
  );
  return limitations.length > 0 ? (
    <Inline as="span" gap="tight">
      Data caveats
      <InfoHint label="Data caveats">{limitations.join(' ')}</InfoHint>
    </Inline>
  ) : null;
}
