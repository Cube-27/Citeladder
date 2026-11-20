import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { ProbeStatus } from '@citeladder/contracts/probes';

import { PerceptionMarket } from '@/components/perception/perception-market';
import { PerceptionObjections } from '@/components/perception/perception-objections';
import { ProbeBar, ProbeEmpty } from '@/components/perception/probe-bar';
import { ProbeDialog } from '@/components/perception/probe-dialog';
import { readErrorProps } from '@/components/ui/notice';
import { SectionStack } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { probeBasis, probeQueries } from '@/lib/api/probes';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { useProjectScope } from '@/lib/project/active-project-scope';

type ProbeView = 'market' | 'objections';

/** Perception's Market or Objections tab: the probe bar over the newest labelled probe. */
export function PerceptionProbe({ view }: Readonly<{ view: ProbeView }>) {
  const { workspaceId, projectId } = useProjectScope();
  const scope = { workspaceId, projectId };
  const client = useQueryClient();
  const status = useQuery(probeQueries.status(scope));
  const [open, setOpen] = useState(false);
  if (status.isPending)
    return (
      <StateBlock kind="loading" label="Loading the market probe…" shape={{ kind: 'figures' }} />
    );
  if (status.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(status)}
        title="Couldn't load the market probe"
        fallback="Check your connection and try again."
      />
    );
  const onRun = () => {
    // The quote reads balances and keys, which change outside this page.
    void client.invalidateQueries({ queryKey: queryKeys.projects.probes(scope) });
    setOpen(true);
  };
  return (
    <SectionStack>
      <ProbeBar scope={scope} status={status.data} onRun={onRun} />
      {view === 'market' ? (
        <MarketRead scope={scope} status={status.data} onRun={onRun} />
      ) : (
        <ObjectionsRead scope={scope} status={status.data} onRun={onRun} />
      )}
      <ProbeDialog scope={scope} quote={status.data.quote} open={open} onOpenChange={setOpen} />
    </SectionStack>
  );
}

type ReadProps = Readonly<{ scope: ProjectScope; status: ProbeStatus; onRun: () => void }>;

function MarketRead({ scope, status, onRun }: ReadProps) {
  const read = useQuery(probeQueries.market(scope, probeBasis(status)));
  if (read.isSuccess && read.data.state === 'value')
    return <PerceptionMarket scope={scope} data={read.data} />;
  return <ReadState read={read} title="Couldn't load Market" status={status} onRun={onRun} />;
}

function ObjectionsRead({ scope, status, onRun }: ReadProps) {
  const read = useQuery(probeQueries.objections(scope, probeBasis(status)));
  if (read.isSuccess && read.data.state === 'value')
    return <PerceptionObjections scope={scope} data={read.data} />;
  return <ReadState read={read} title="Couldn't load objections" status={status} onRun={onRun} />;
}

/** A probe read's loading, failed and no-probe-yet states. */
function ReadState({
  read,
  title,
  status,
  onRun,
}: Readonly<{
  read: UseQueryResult;
  title: string;
  status: ProbeStatus;
  onRun: () => void;
}>) {
  if (read.isPending)
    return <StateBlock kind="loading" label="Loading…" shape={{ kind: 'figures' }} />;
  if (read.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(read)}
        title={title}
        fallback="Check your connection and try again."
      />
    );
  return <ProbeEmpty status={status} onRun={onRun} />;
}
