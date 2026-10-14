import { Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { InfoHint } from '@/components/ui/info-hint';
import { textRole } from '@/components/ui/typography';
import type { DemandSnapshot } from '@/lib/api/demand';
import { detectorStates } from '@/lib/demand/signals';

/**
 * What each detector looks for, in the words of its rule. The thresholds
 * restate the API's demand policy (`services/api/src/config/demand.json`);
 * change them together.
 */
const DETECTORS: readonly { key: string; label: string; rule: string }[] = [
  {
    key: 'striking_distance',
    label: 'Striking distance',
    rule: 'Non-branded queries averaging position 4–15 with at least 50 impressions.',
  },
  {
    key: 'cannibalization',
    label: 'Cannibalization',
    rule: 'Non-branded queries where two or more of your pages each earn at least 20 impressions and 10% of the query’s impressions.',
  },
  {
    key: 'property_relative_ctr_gap',
    label: 'CTR gap',
    rule: 'Queries with at least 100 impressions whose CTR is at least 25%, and 2 points, below the median at their position. A position needs 20 queries and 500 impressions to set that median.',
  },
  {
    key: 'query_trends',
    label: 'Trends',
    rule: 'Queries whose impressions grew 1.5× or more, or fell to 0.67× or less, between the last two 14-day windows. Needs 28 days of continuous Search Console coverage.',
  },
];

type DetectorStatus = Readonly<{ label: string; tone: 'success' | 'warning' | 'info' | null }>;

/** A detector's state as a status; one the snapshot did not report says so. */
function detectorStatus(state: string | undefined): DetectorStatus {
  switch (state) {
    case 'available':
      return { label: 'Active', tone: 'success' };
    case 'partial':
      return { label: 'Partial', tone: 'warning' };
    case 'insufficient_history':
      return { label: 'Needs more history', tone: 'info' };
    case 'unavailable':
      return { label: 'Unavailable', tone: null };
    case undefined:
      return { label: 'Not reported', tone: null };
    default:
      return { label: state.replaceAll('_', ' '), tone: null };
  }
}

function isRunning(state: string | undefined) {
  return state === 'available' || state === 'partial';
}

/**
 * Which detectors ran on this snapshot. A read-only status list: each name,
 * its state, and an info hint carrying the rule and anything that limited it.
 */
export function DemandDetectorBar({ snapshot }: Readonly<{ snapshot: DemandSnapshot }>) {
  const detectors = detectorStates(snapshot.summary);
  const reported = Object.keys(detectors).length > 0;
  const running = DETECTORS.filter(({ key }) => isRunning(detectors[key]?.state)).length;

  const limitations = Array.from(
    new Set(snapshot.signals.flatMap((signal) => signal.limitations).filter(Boolean)),
  );

  return (
    <section aria-labelledby="demand-detectors" className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 id="demand-detectors" className={textRole('label')}>
          Detectors
        </h3>
        <span className={textRole('caption', 'tabular-nums')}>
          {reported ? `${running} of ${DETECTORS.length} active` : 'No detector status reported'}
        </span>
      </div>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {DETECTORS.map(({ key, label, rule }) => {
          const detector = detectors[key];
          const status = detectorStatus(detector?.state);
          const hint = [rule, ...(detector?.limitations ?? [])].join(' ');
          return (
            <li key={key} className="flex items-center gap-2">
              <span className={textRole('body', 'text-foreground')}>{label}</span>
              {status.tone ? (
                <Badge variant="status" value={status.tone}>
                  {status.label}
                </Badge>
              ) : (
                <Badge>{status.label}</Badge>
              )}
              <InfoHint label={`How the ${label} detector works`}>{hint}</InfoHint>
            </li>
          );
        })}
      </ul>
      {limitations.length > 0 ? (
        <p className={textRole('caption', 'flex items-start gap-2')}>
          <Info className="mt-1 size-3 shrink-0" aria-hidden="true" />
          {limitations.join(' ')}
        </p>
      ) : null}
    </section>
  );
}
