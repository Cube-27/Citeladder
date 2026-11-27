import { AuditSchedules } from '@/components/runs/audit-schedules';
import {
  FirstRunAction,
  LaunchAuditButton,
  useLaunchReadiness,
} from '@/components/runs/launch-audit-button';
import { RunsTable, useRunsPage, type RunsTablePage } from '@/components/runs/runs-table';
import { ReportPage } from '@/components/templates/report-page';
import { Spinner } from '@/components/ui/spinner';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import { Play } from '@/lib/icons';
import type { Audit, AuditStatus } from '@citeladder/contracts';
import { auditStatusSchema } from '@citeladder/contracts/audits';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { ACTIVE_AUDIT_STATUSES, statusCount } from '@/lib/runs/status';
import { readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

type StatusFilter = 'all' | 'completed' | 'partial' | 'running' | 'failed';

const STATUS_FILTER_IDS: readonly StatusFilter[] = [
  'all',
  'completed',
  'partial',
  'running',
  'failed',
];

const STATUS_FILTERS = {
  all: { label: 'All', statuses: auditStatusSchema.options },
  completed: { label: 'Completed', statuses: ['completed'] },
  partial: { label: 'Partial', statuses: ['partially_completed'] },
  running: { label: 'Running', statuses: ACTIVE_AUDIT_STATUSES },
  failed: { label: 'Failed or cancelled', statuses: ['failed', 'cancelled'] },
} as const satisfies Record<StatusFilter, { label: string; statuses: readonly AuditStatus[] }>;

const statusCodec = stringUrlCodec<StatusFilter>(STATUS_FILTER_IDS, 'all');

export function RunsScreen() {
  const { projectId, project } = useProjectScope();
  const [statusFilter, setStatusFilter] = useUrlState('status', statusCodec, {
    clearKeys: ['page'],
  });

  const filter = STATUS_FILTERS[statusFilter];
  const { query: runsQuery, table } = useRunsPage(statusFilter === 'all' ? [] : filter.statuses);
  const counts = runsQuery.data?.status_counts;
  const runCount = counts ? statusCount(counts, auditStatusSchema.options) : 0;
  const anyActive = counts ? statusCount(counts, ACTIVE_AUDIT_STATUSES) > 0 : false;

  const canRun = useWorkspaceCapability('run');
  const readiness = useLaunchReadiness(projectId);
  const empty = runsQuery.isSuccess && runCount === 0;
  const actions = empty ? undefined : (
    <MastheadPrimary>
      <LaunchAuditButton />
    </MastheadPrimary>
  );
  const tabs =
    counts === undefined || runCount === 0 ? undefined : (
      <TabRow
        ariaLabel="Filter by status"
        items={STATUS_FILTER_IDS.map((id) => ({
          value: id,
          label: STATUS_FILTERS[id].label,
          count: statusCount(counts, STATUS_FILTERS[id].statuses),
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
            runCount={runCount}
            audits={runsQuery.data?.items ?? []}
            table={table}
            filterLabel={filter.label}
            anyActive={anyActive}
            canRun={canRun}
            promptsReady={readiness.kind !== 'blocked'}
          />
        </TabPanel>

        {readiness.kind === 'ready' ? (
          <AuditSchedules projectId={projectId} promptSets={project.prompt_sets} />
        ) : null}
      </ReportPage>
    </TabsRoot>
  );
}

function RunsContent({
  read,
  runCount,
  audits,
  table,
  filterLabel,
  anyActive,
  canRun,
  promptsReady,
}: Readonly<{
  read: RetryableRead;
  runCount: number;
  audits: readonly Audit[];
  table: RunsTablePage;
  filterLabel: string;
  anyActive: boolean;
  canRun: boolean;
  promptsReady: boolean;
}>) {
  if (read.error) {
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(read)}
        title="Couldn't load the runs"
        fallback="The request failed or timed out."
      />
    );
  }
  if (runCount === 0) {
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

  return (
    <RunsTable
      audits={audits}
      table={table}
      emptyHeading={`No ${filterLabel.toLowerCase()} runs`}
      status={anyActive ? <Spinner label="Updating live" showLabel /> : null}
    />
  );
}
