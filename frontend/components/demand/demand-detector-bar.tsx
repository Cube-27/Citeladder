import { Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { InfoHint } from '@/components/ui/info-hint';
import { textRole } from '@/components/ui/typography';
import type { DemandSnapshot } from '@/lib/api/demand';
import { DEMAND_DETECTORS as DETECTORS } from '@/lib/config/demand';
import { detectorStates } from '@/lib/demand/signals';

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
