import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useMemo } from 'react';

import { AuditSchedules } from '@/components/runs/audit-schedules';
import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { RunsTable } from '@/components/runs/runs-table';
import { CollectionPage } from '@/components/templates/collection-page';
import { FilterBar } from '@/components/ui/filter-bar';
import { Spinner } from '@/components/ui/spinner';
import { SegmentedControl } from '@/components/ui/tabs';
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
  const [statusFilter, setStatusFilter] = useUrlState('status', statusCodec);

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
  // The page keeps its action and status filters while the first load lands.
  // Launching is offered only to a role that may run audits.
  const canRun = useWorkspaceCapability('run');
  // With no run yet, Launch run is the empty state's own button, not the masthead's.
  const empty = runsQuery.isSuccess && audits.length === 0;
  const actions = empty ? undefined : (
    <MastheadPrimary>
      <LaunchAuditButton />
    </MastheadPrimary>
  );
  // The status choice is the row's view: the one shared segmented control,
  // each choice with the number of runs it keeps (2026-11-03 app review).
  const filters = (
    <FilterBar
      view={
        <SegmentedControl
          ariaLabel="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS.map((filter) => ({
            value: filter.id,
            label: filter.label,
            count: audits.filter(filter.match).length,
          }))}
        />
      }
    />
  );

  if (runsQuery.isLoading) {
    return (
      <CollectionPage actions={actions} filters={filters}>
        <StateBlock kind="loading" label="Loading runs…" />
      </CollectionPage>
    );
  }

  return (
    <CollectionPage actions={actions} filters={filters}>
      <RunsContent
        read={runsQuery}
        audits={audits}
        filteredAudits={filteredAudits}
        statusFilter={statusFilter}
        anyActive={anyActive}
        canRun={canRun}
      />

      <AuditSchedules projectId={projectId} promptSets={project.prompt_sets} />
    </CollectionPage>
  );
}

function RunsContent({
  read,
  audits,
  filteredAudits,
  statusFilter,
  anyActive,
  canRun,
}: Readonly<{
  /** The runs read: its failure, and the retry of exactly that read. */
  read: RetryableRead;
  audits: Audit[];
  filteredAudits: Audit[];
  statusFilter: StatusFilter;
  anyActive: boolean;
  /** Whether this role may launch an audit. */
  canRun: boolean;
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
        description={
          canRun
            ? 'A run asks AI engines your prompts and measures how they answer about your brand.'
            : 'No run has measured how AI engines answer questions about this brand yet.'
        }
        action={canRun ? <LaunchAuditButton captioned /> : undefined}
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
