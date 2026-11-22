import { useIsFetching, useMutation } from '@tanstack/react-query';

import type { ProbeRun, ProbeStatus } from '@citeladder/contracts/probes';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { StateBlock } from '@/components/ui/state-block';
import { useToast } from '@/components/ui/toast';
import { textRole } from '@/components/ui/typography';
import { humanizeApiError } from '@/lib/api/errors';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { probeBusy, probeMutations, type ProbeView } from '@/lib/api/probes';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, pluralCount } from '@/lib/format';
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

function pendingRun(run: ProbeRun | null, date: (iso: string) => string): string | null {
  if (!run) return null;
  switch (run.state) {
    case 'running':
      return `Probe running · ${pluralCount(run.engines.length, 'engine')} · ${pluralCount(run.markets.length, 'market')}`;
    case 'labelling':
      return `Labelling ${pluralCount(run.answers, 'answer')}`;
    case 'ready':
      return null;
    case 'failed':
      return `Last probe failed · ${date(run.created_at)}`;
    case 'unavailable':
      return `Last probe couldn't be labelled · ${date(run.created_at)}`;
    default: {
      const unreachable: never = run.state;
      return unreachable;
    }
  }
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
  const timeZone = useDisplayTimeZone();
  const { notify } = useToast();
  const mayRun = useWorkspaceCapability('run');
  const mayWrite = useWorkspaceCapability('write');
  const schedule = useMutation(probeMutations.schedule(scope));
  const refreshing = useIsFetching({ queryKey: queryKeys.projects.probes(scope) }) > 0;
  const pending = pendingRun(status.latest, (iso) => formatDisplayDate(iso, timeZone));
  return (
    <Inline className="flex-wrap justify-end">
      {pending ? <span className={textRole('caption', 'text-ink-2')}>{pending}</span> : null}
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

export function ProbeEmpty({
  status,
  onRun,
}: Readonly<{ status: ProbeStatus; onRun: () => void }>) {
  const mayRun = useWorkspaceCapability('run');
  if (probeBusy(status))
    return (
      <StateBlock
        kind="empty"
        heading="Probe running"
        description="Results appear when it finishes."
      />
    );
  const failed = status.latest?.state === 'failed' || status.latest?.state === 'unavailable';
  return (
    <StateBlock
      kind="empty"
      heading={failed ? "The last probe couldn't finish" : 'No market probe yet'}
      description="A probe asks each engine what you're known for, which brands lead each theme, and why a buyer might not choose you. It's paid from your AI credits."
      action={mayRun ? <Button onClick={onRun}>Run probe</Button> : undefined}
    />
  );
}
