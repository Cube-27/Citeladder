import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useMemo } from 'react';

import { AuditSchedules } from '@/components/runs/audit-schedules';
import {
  FirstRunAction,
  LaunchAuditButton,
  useLaunchReadiness,
} from '@/components/runs/launch-audit-button';
import { RunsTable } from '@/components/runs/runs-table';
import { ReportPage } from '@/components/templates/report-page';
import { Spinner } from '@/components/ui/spinner';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import { runsQueries } from '@/lib/api/runs';
import type { Audit } from '@citeladder/contracts';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { AUDIT_STATES, pollAudits } from '@/lib/runs/status';
import { readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

type StatusFilter = 'all' | 'completed' | 'running' | 'failed';

const STATUS_FILTERS: {
  id: StatusFilter;
  label: string;
  match: (audit: Audit) => boolean;
}[] = [
  { id: 'all', label: 'All', match: () => true },
  {
    id: 'completed',
    label: 'Completed',
    match: (audit) => audit.status === 'completed',
  },
  {
    id: 'running',
    label: 'Running',
    match: (audit) => AUDIT_STATES[audit.status].active,
  },
  {
    id: 'failed',
    label: 'Failed',
    match: (audit) => audit.status === 'failed',
  },
];

const statusCodec = stringUrlCodec<StatusFilter>(
  STATUS_FILTERS.map((filter) => filter.id),
  'all',
);

/** Active-project run list, status filtering (kept in the URL), launch, and schedule management. */
export function RunsScreen() {
  const { workspaceId, projectId, project } = useProjectScope();
  // Another status lists other runs: it opens on their first page (`RunsTable`).
  const [statusFilter, setStatusFilter] = useUrlState('status', statusCodec, {
    clearKeys: ['page'],
  });

  const runsQuery = useQuery({
    ...runsQueries.list({ workspaceId, projectId }),
    refetchInterval: (query) => pollAudits(query.state.data?.map((audit) => audit.status)),
  });

  const audits = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const filteredAudits = useMemo(
    () =>
      audits.filter(
        STATUS_FILTERS.find((filter) => filter.id === statusFilter)?.match ?? (() => true),
      ),
    [audits, statusFilter],
  );
  const anyActive = audits.some((audit) => AUDIT_STATES[audit.status].active);

  // Gate only on the runs list: the schedules query errors independently
  // (and refetches whenever its card remounts onto the errored cache entry),
  // so gating the whole screen on it would pin the page on a spinner forever.
  // Launching is offered only to a role that may run audits.
  const canRun = useWorkspaceCapability('run');
  const readiness = useLaunchReadiness(projectId);
  // With no run yet, the empty state carries the next step, not the masthead.
  const empty = runsQuery.isSuccess && audits.length === 0;
  const actions = empty ? undefined : (
    <MastheadPrimary>
      <LaunchAuditButton />
    </MastheadPrimary>
  );
  // The status choices are the page's tabs, each with the number of runs it
  // keeps. A never-filled list has none.
  const tabs =
    audits.length === 0 ? undefined : (
      <TabRow
        ariaLabel="Filter by status"
        items={STATUS_FILTERS.map((filter) => ({
          value: filter.id,
          label: filter.label,
          count: audits.filter(filter.match).length,
        }))}
      />
    );

  if (runsQuery.isLoading) {
    return (
      <ReportPage actions={actions}>
        <StateBlock kind="loading" label="Loading runs…" shape={{ kind: 'table' }} />
      </ReportPage>
    );
  }

  return (
    <TabsRoot value={statusFilter} onValueChange={setStatusFilter}>
      <ReportPage actions={actions} tabs={tabs}>
        <TabPanel value={statusFilter}>
          <RunsContent
            read={runsQuery}
            audits={audits}
            filteredAudits={filteredAudits}
            statusFilter={statusFilter}
            anyActive={anyActive}
            canRun={canRun}
            promptsReady={readiness.kind !== 'blocked'}
          />
        </TabPanel>

        {/* A schedule runs active prompts, so it waits until one exists. */}
        {readiness.kind === 'ready' ? (
          <AuditSchedules projectId={projectId} promptSets={project.prompt_sets} />
        ) : null}
      </ReportPage>
    </TabsRoot>
  );
}

function RunsContent({
  read,
  audits,
  filteredAudits,
  statusFilter,
  anyActive,
  canRun,
  promptsReady,
}: Readonly<{
  /** The runs read: its failure, and the retry of exactly that read. */
  read: RetryableRead;
  audits: Audit[];
  filteredAudits: Audit[];
  statusFilter: StatusFilter;
  anyActive: boolean;
  /** Whether this role may launch an audit. */
  canRun: boolean;
  /** False while no active prompt exists, so the next step is adding one. */
  promptsReady: boolean;
}>) {
  if (read.error) {
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(read)}
        title="Couldn't load the runs"
        fallback="Check your connection and try again."
      />
    );
  }
  if (audits.length === 0) {
    return (
      <StateBlock
        kind="empty"
        icon={Play}
        heading="No runs yet"
        description={canRun && !promptsReady ? 'Add prompts to start.' : undefined}
        action={canRun ? <FirstRunAction /> : undefined}
      />
    );
  }

  const filterLabel = STATUS_FILTERS.find(
    (filter) => filter.id === statusFilter,
  )?.label.toLowerCase();
  return (
    <RunsTable
      audits={filteredAudits}
      emptyHeading={`No ${filterLabel} runs`}
      status={
        anyActive ? (
          <Spinner label="Updating every 3 seconds while a run is active" showLabel />
        ) : null
      }
    />
  );
}
