import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import type { ProbeStatus } from '@citeladder/contracts/probes';

import { PerceptionMarket } from '@/components/perception/perception-market';
import { PerceptionObjections } from '@/components/perception/perception-objections';
import { ProbeActions, ProbeEmpty } from '@/components/perception/probe-actions';
import { ProbeDialog, type ProbeIntent } from '@/components/perception/probe-dialog';
import { ProbeOutcome, ProbeProgress } from '@/components/perception/probe-progress';
import { Stack } from '@/components/ui/layout';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import {
  probeBasis,
  probeBusy,
  probeQueries,
  refreshProbeStatus,
  type ProbeView,
} from '@/lib/api/probes';
import { useProjectScope } from '@/lib/project/active-project-scope';

const hasPages = (row: { pages: readonly unknown[] }) => row.pages.length > 0;

export function useProbeControls(view: ProbeView | null) {
  const { workspaceId, projectId } = useProjectScope();
  const scope = { workspaceId, projectId };
  const client = useQueryClient();
  const status = useQuery({ ...probeQueries.status(scope), enabled: view !== null });
  const basis = probeBasis(status.data);
  const market = useQuery({
    ...probeQueries.market(scope, basis),
    enabled: status.isSuccess && view === 'market',
  });
  const objections = useQuery({
    ...probeQueries.objections(scope, basis),
    enabled: status.isSuccess && view === 'objections',
  });
  const exportable =
    (view === 'market' && market.data?.state === 'value' && market.data.themes.some(hasPages)) ||
    (view === 'objections' &&
      objections.data?.state === 'value' &&
      objections.data.groups.some(hasPages));
  const [intent, setIntent] = useState<ProbeIntent | null>(null);
  const confirm = (next: ProbeIntent) => {
    refreshProbeStatus(client, scope);
    setIntent(next);
  };
  const onRun = () => confirm({ kind: 'run' });
  const ready = view !== null && status.isSuccess;
  return {
    scope,
    status,
    market,
    objections,
    onRun,
    actions: ready ? (
      <ProbeActions
        scope={scope}
        status={status.data}
        onRun={onRun}
        onSchedule={(cadence) => confirm({ kind: 'schedule', cadence })}
        exportView={exportable ? view : null}
      />
    ) : undefined,
    dialog: ready ? (
      <ProbeDialog
        scope={scope}
        quote={status.data.quote}
        intent={intent}
        onClose={() => setIntent(null)}
      />
    ) : null,
  };
}

export type ProbeControls = ReturnType<typeof useProbeControls>;

export function PerceptionProbe({
  view,
  controls,
}: Readonly<{ view: ProbeView; controls: ProbeControls }>) {
  const { scope, status, market, objections, onRun } = controls;
  if (status.isPending)
    return (
      <StateBlock kind="loading" label="Loading the market probe…" shape={{ kind: 'figures' }} />
    );
  if (status.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(status)}
        title={view === 'objections' ? "Couldn't load objections" : "Couldn't load the market view"}
        fallback="The request failed or timed out."
      />
    );
  const read =
    view === 'market' ? (
      <ProbeRead
        read={market}
        title="Couldn't load Market"
        status={status.data}
        onRun={onRun}
        render={(data) => <PerceptionMarket data={data} />}
      />
    ) : (
      <ProbeRead
        read={objections}
        title="Couldn't load objections"
        status={status.data}
        onRun={onRun}
        render={(data) => <PerceptionObjections scope={scope} data={data} />}
      />
    );
  const latest = status.data.latest;
  return (
    <Stack gap="workspace">
      {latest ? <ProbeProgress run={latest} /> : null}
      {read}
    </Stack>
  );
}

function ProbeRead<Value>({
  read,
  title,
  status,
  onRun,
  render,
}: Readonly<{
  read: UseQueryResult<{ state: 'none' } | ({ state: 'value' } & Value)>;
  title: string;
  status: ProbeStatus;
  onRun: () => void;
  render: (data: { state: 'value' } & Value) => ReactNode;
}>) {
  if (read.isSuccess && read.data.state === 'value')
    return (
      <Stack gap="workspace">
        <ProbeOutcome run={status.latest} />
        {render(read.data)}
      </Stack>
    );
  if (read.isPending)
    return <StateBlock kind="loading" label="Loading…" shape={{ kind: 'figures' }} />;
  if (read.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(read)}
        title={title}
        fallback="The request failed or timed out."
      />
    );
  return probeBusy(status) ? null : <ProbeEmpty status={status} onRun={onRun} />;
}
