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
 * Which detectors ran on this snapshot, as one read-only line: the count, then
 * each detector's status chip with an info hint carrying its rule and anything
 * that limited it. Data caveats shared by the signals sit in the count's hint.
 */
export function DemandDetectorBar({ snapshot }: Readonly<{ snapshot: DemandSnapshot }>) {
  const detectors = detectorStates(snapshot.summary);
  const reported = Object.keys(detectors).length > 0;
  const running = DETECTORS.filter(({ key }) => isRunning(detectors[key]?.state)).length;

  const limitations = Array.from(
    new Set(snapshot.signals.flatMap((signal) => signal.limitations).filter(Boolean)),
  );

  return (
    <section
      aria-labelledby="demand-detectors"
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      <div className="flex items-center gap-2">
        <h3 id="demand-detectors" className={textRole('label')}>
          Detectors
        </h3>
        <span className={textRole('caption', 'tabular-nums')}>
          {reported ? `${running} of ${DETECTORS.length} active` : 'No status reported'}
        </span>
        {limitations.length > 0 ? (
          <InfoHint label="Data caveats">{limitations.join(' ')}</InfoHint>
        ) : null}
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {DETECTORS.map(({ key, label, rule }) => {
          const detector = detectors[key];
          const status = detectorStatus(detector?.state);
          const hint = [rule, ...(detector?.limitations ?? [])].join(' ');
          const text = `${label} · ${status.label}`;
          return (
            <li key={key} className="flex items-center gap-1">
              {status.tone ? (
                <Badge variant="status" value={status.tone}>
                  {text}
                </Badge>
              ) : (
                <Badge>{text}</Badge>
              )}
              <InfoHint label={`How the ${label} detector works`}>{hint}</InfoHint>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
