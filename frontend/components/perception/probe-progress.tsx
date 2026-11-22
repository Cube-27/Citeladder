import type { ProbeRun } from '@citeladder/contracts/probes';

import { Notice } from '@/components/ui/notice';
import { countMeter, WorkProgress } from '@/components/ui/work-progress';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayDate, pluralCount } from '@/lib/format';

function runningStep(run: ProbeRun) {
  const failed = run.failed > 0 ? ` · ${formatCount(run.failed)} failed` : '';
  return {
    narration: `Step 1 of 2 · Asking ${pluralCount(run.engines.length, 'engine')} in ${pluralCount(run.markets.length, 'market')}`,
    meter: countMeter({
      done: run.answers + run.failed,
      total: run.planned,
      label: `${formatCount(run.answers)} of ${pluralCount(run.planned, 'answer')} back${failed}`,
    }),
  };
}

export function ProbeProgress({ run }: Readonly<{ run: ProbeRun }>) {
  if (run.state !== 'running' && run.state !== 'labelling') return null;
  const step =
    run.state === 'running'
      ? runningStep(run)
      : {
          narration: `Step 2 of 2 · Reading ${pluralCount(run.answers, 'answer')} and grouping themes and objections`,
          meter: null,
        };
  return <WorkProgress label="Probe progress" {...step} />;
}

export function ProbeOutcome({ run }: Readonly<{ run: ProbeRun | null }>) {
  const timeZone = useDisplayTimeZone();
  if (!run) return null;
  const started = formatDisplayDate(run.created_at, timeZone);
  switch (run.state) {
    case 'failed':
      return (
        <Notice tone="negative">
          The probe started {started} failed: no engine answered. These results are from an earlier
          probe.
        </Notice>
      );
    case 'unavailable':
      return (
        <Notice tone="warning">
          The probe started {started} got answers but couldn&apos;t be labelled. These results are
          from an earlier probe.
        </Notice>
      );
    case 'ready':
      return run.answers < run.planned ? (
        <Notice tone="warning">
          {formatCount(run.answers)} of {pluralCount(run.planned, 'answer')} came back. These
          results use only those.
        </Notice>
      ) : null;
    case 'running':
    case 'labelling':
      return null;
    default: {
      const unreachable: never = run.state;
      return unreachable;
    }
  }
}
