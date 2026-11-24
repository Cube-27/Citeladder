import type { ProbeRun } from '@citeladder/contracts/probes';

import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';
import { countMeter, WorkProgress } from '@/components/ui/work-progress';
import { humanizeApiError } from '@/lib/api/errors';
import { probeMutations } from '@/lib/api/probes';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayDate, pluralCount } from '@/lib/format';
import { useWorkspaceCapability } from '@/lib/project/project-scope';

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

function CancelProbe({ scope }: Readonly<{ scope: ProjectScope }>) {
  const { notify } = useToast();
  const mayWrite = useWorkspaceCapability('write');
  const cancel = useMutation(probeMutations.cancel(scope));
  if (!mayWrite) return null;
  return (
    <Button
      variant="secondary"
      pending={cancel.isPending}
      onClick={() =>
        cancel.mutate(undefined, {
          onError: (error) =>
            notify("Couldn't cancel the probe", humanizeApiError(error).message, {
              tone: 'negative',
            }),
        })
      }
    >
      Cancel probe
    </Button>
  );
}

export function ProbeProgress({ scope, run }: Readonly<{ scope: ProjectScope; run: ProbeRun }>) {
  if (run.state !== 'running' && run.state !== 'labelling') return null;
  const step =
    run.state === 'running'
      ? runningStep(run)
      : {
          narration: `Step 2 of 2 · Reading ${pluralCount(run.answers, 'answer')} and grouping themes and objections`,
          meter: null,
        };
  return (
    <WorkProgress
      label="Probe progress"
      {...step}
      action={run.state === 'running' ? <CancelProbe scope={scope} /> : undefined}
    />
  );
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
    case 'cancelled':
      return (
        <Notice tone="info">
          The probe started {started} was cancelled before an engine answered. These results are
          from an earlier probe.
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
