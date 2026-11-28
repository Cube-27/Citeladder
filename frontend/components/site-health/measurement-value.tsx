import { Absence, printed } from '@/components/ui/absence';
import { scoreTone } from '@/components/ui/score-gauge';
import { Text } from '@/components/ui/typography';
import {
  checksRunLabel,
  formatScore,
  measurementCaveat,
  type ChecksRun,
} from '@/lib/site-health/status';

export function MeasurementValue({
  score,
  checks,
  state,
}: Readonly<{ score: number | null; checks: ChecksRun | null; state: string }>) {
  if (score === null) {
    const run = checksRunLabel(checks);
    if (run) return <Absence state="not_measured" label={run} />;
    if (state === 'excluded') return <Absence state="not_applicable" label="Excluded" />;
    return <Absence state="not_measured" />;
  }
  const tone = scoreTone(score);
  const caveat = measurementCaveat(state, checks);
  return (
    <span>
      {tone === 'positive' ? (
        <Text variant="body">{printed(formatScore(score))}</Text>
      ) : (
        <Text variant="label" tone={tone}>
          {printed(formatScore(score))}
        </Text>
      )}
      {caveat ? (
        <>
          {' '}
          <span className="sr-only">{caveat}</span>
        </>
      ) : null}
    </span>
  );
}
