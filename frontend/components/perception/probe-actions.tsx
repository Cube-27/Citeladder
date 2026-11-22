import { useIsFetching, useMutation } from '@tanstack/react-query';

import type { ProbeStatus } from '@citeladder/contracts/probes';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { StateBlock } from '@/components/ui/state-block';
import { useToast } from '@/components/ui/toast';
import { humanizeApiError } from '@/lib/api/errors';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { probeBusy, probeMutations, type ProbeView } from '@/lib/api/probes';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { Download } from '@/lib/icons';
import { useWorkspaceCapability } from '@/lib/project/project-scope';

type Cadence = 'off' | 'daily' | 'weekly';

const CADENCES = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
] as const satisfies readonly { value: Cadence; label: string }[];

function cadenceOf(schedule: ProbeStatus['schedule']): Cadence {
  if (!schedule?.enabled) return 'off';
  return schedule.cadence === 'daily' || schedule.cadence === 'weekly' ? schedule.cadence : 'off';
}

export function ProbeActions({
  scope,
  status,
  onRun,
  onSchedule,
  exportView,
}: Readonly<{
  scope: ProjectScope;
  status: ProbeStatus;
  onRun: () => void;
  onSchedule: (cadence: 'daily' | 'weekly') => void;
  exportView: ProbeView | null;
}>) {
  const { notify } = useToast();
  const mayRun = useWorkspaceCapability('run');
  const mayWrite = useWorkspaceCapability('write');
  const schedule = useMutation(probeMutations.schedule(scope));
  const refreshing = useIsFetching({ queryKey: queryKeys.projects.probes(scope) }) > 0;
  return (
    <Inline className="flex-wrap justify-end">
      <Select<Cadence>
        ariaLabel="Probe schedule"
        value={cadenceOf(status.schedule)}
        options={CADENCES}
        disabled={!mayWrite || schedule.isPending}
        onValueChange={(cadence) =>
          cadence === 'off'
            ? schedule.mutate(
                { cadence: null },
                {
                  onError: (error) =>
                    notify(
                      "Couldn't save the schedule",
                      mutationNoticeForError(error, { action: 'save the schedule' }).message,
                      { tone: 'negative' },
                    ),
                },
              )
            : onSchedule(cadence)
        }
      />
      <Button
        variant="primary"
        disabled={!mayRun || refreshing || probeBusy(status)}
        onClick={onRun}
      >
        Run probe
      </Button>
      {exportView ? <ProbeExport scope={scope} view={exportView} /> : null}
    </Inline>
  );
}

const EXPORTS = {
  market: { label: 'Export themes CSV', failure: "Couldn't export the themes" },
  objections: { label: 'Export objections CSV', failure: "Couldn't export the objections" },
} as const satisfies Record<ProbeView, { label: string; failure: string }>;

function ProbeExport({ scope, view }: Readonly<{ scope: ProjectScope; view: ProbeView }>) {
  const { notify } = useToast();
  const exporting = useMutation(probeMutations.exportSources(scope, view));
  const { label, failure } = EXPORTS[view];
  return (
    <Button
      variant="secondary"
      pending={exporting.isPending}
      onClick={() =>
        exporting.mutate(undefined, {
          onError: (error) =>
            notify(failure, humanizeApiError(error).message, { tone: 'negative' }),
        })
      }
    >
      <Icon icon={Download} />
      {label}
    </Button>
  );
}

const FAILED = {
  failed: 'The last probe failed',
  unavailable: "The last probe couldn't be labelled",
} as const;

export function ProbeEmpty({
  status,
  onRun,
}: Readonly<{ status: ProbeStatus; onRun: () => void }>) {
  const mayRun = useWorkspaceCapability('run');
  const state = status.latest?.state;
  return (
    <StateBlock
      kind="empty"
      heading={
        state === 'failed' || state === 'unavailable' ? FAILED[state] : 'No market probe yet'
      }
      description="A probe asks each engine what you're known for, which brands lead each theme, and why a buyer might not choose you. It's paid from your AI credits."
      action={mayRun ? <Button onClick={onRun}>Run probe</Button> : undefined}
    />
  );
}
