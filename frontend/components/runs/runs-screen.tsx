'use client';

import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AuditSchedules } from '@/components/runs/audit-schedules';
import { LaunchDialog } from '@/components/runs/launch-dialog';
import { RunsTable } from '@/components/runs/runs-table';
import { PageShell } from '@/components/layout/page-shell';
import { PageLoading } from '@/components/layout/page-loading';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterChip } from '@/components/ui/filter-chip';
import { Stack } from '@/components/ui/layout';
import { queryKeys } from '@/lib/api/query-keys';
import { runsApi } from '@/lib/api/runs';
import type { Audit } from '@/lib/api/types';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useActiveProject } from '@/lib/project/project-context';
import { resolveActiveProjectRequestScope } from '@/lib/project/request-scope';
import { shouldPollAudit } from '@/lib/runs/status';

/** Poll interval (ms) for the runs list while any run is active. */
const POLL_INTERVAL_MS = 3_000;

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
    match: (audit) => shouldPollAudit(audit.status),
  },
  {
    id: 'failed',
    label: 'Failed',
    match: (audit) => audit.status === 'failed',
  },
];

/** Active-project run list, status filtering, launch, and schedule management. */
export function RunsScreen() {
  const project = useActiveProject();
  const scope = resolveActiveProjectRequestScope(project);
  const projectId = scope.projectId;
  const router = useNavigate();
  const projectHref = useProjectHref();
  const [launchOpen, setLaunchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const runsQuery = useQuery({
    queryKey: queryKeys.runs.list({ project_id: projectId }),
    queryFn: ({ signal }) =>
      runsApi.listAudits({ project_id: projectId }, { signal, workspaceId: scope.workspaceId }),
    enabled: scope.enabled,
    refetchInterval: (query) => {
      const audits = query.state.data;
      return audits?.some((audit) => shouldPollAudit(audit.status)) ? POLL_INTERVAL_MS : false;
    },
  });

  const audits = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const filteredAudits = useMemo(
    () =>
      audits.filter(
        STATUS_FILTERS.find((filter) => filter.id === statusFilter)?.match ?? (() => true),
      ),
    [audits, statusFilter],
  );
  const anyActive = audits.some((audit) => shouldPollAudit(audit.status));

  // Gate only on the runs list: the schedules query errors independently
  // (and refetches whenever its card remounts onto the errored cache entry),
  // so gating the whole screen on it would pin the page on a spinner forever.
  if (runsQuery.isLoading) {
    return (
      <PageShell>
        <PageLoading label="Loading runs…" />
      </PageShell>
    );
  }

  return (
    <PageShell
      actions={
        <Button size="sm" onClick={() => setLaunchOpen(true)} disabled={!projectId}>
          Launch audit
        </Button>
      }
      controls={
        <fieldset className="contents" aria-label="Filter by status">
          {STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter.id}
              active={statusFilter === filter.id}
              onClick={() => setStatusFilter(filter.id)}
              count={audits.filter(filter.match).length}
            >
              {filter.label}
            </FilterChip>
          ))}
        </fieldset>
      }
    >
      <Stack gap="section">
        <RunsContent
          projectId={projectId}
          isError={runsQuery.isError}
          audits={audits}
          filteredAudits={filteredAudits}
          statusFilter={statusFilter}
          anyActive={anyActive}
          onLaunch={() => setLaunchOpen(true)}
        />

        {projectId && project ? (
          <AuditSchedules projectId={projectId} promptSets={project.prompt_sets} />
        ) : null}

        {projectId ? (
          <LaunchDialog
            open={launchOpen}
            onOpenChange={setLaunchOpen}
            projectId={projectId}
            onLaunched={(audit) => router(projectHref(`/runs/${audit.id}`))}
          />
        ) : null}
      </Stack>
    </PageShell>
  );
}

function RunsContent({
  projectId,
  isError,
  audits,
  filteredAudits,
  statusFilter,
  anyActive,
  onLaunch,
}: Readonly<{
  projectId: string | null;
  isError: boolean;
  audits: Audit[];
  filteredAudits: Audit[];
  statusFilter: StatusFilter;
  anyActive: boolean;
  onLaunch: () => void;
}>) {
  if (!projectId) return <Alert tone="info">Select or create a project to launch runs.</Alert>;
  if (isError) {
    return <Alert tone="danger">Could not load runs. Check your connection and try again.</Alert>;
  }
  if (audits.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={Play}
            heading="No runs yet"
            description="Launch your first audit to measure how AI engines answer questions about your brand."
            action={
              <Button variant="ghost" onClick={onLaunch}>
                Launch your first audit
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const filterLabel = STATUS_FILTERS.find(
    (filter) => filter.id === statusFilter,
  )?.label.toLowerCase();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2 border-b-0 pb-3">
        <CardTitle>All runs</CardTitle>
        {anyActive ? (
          <span className="mono text-muted inline-flex items-center gap-1.5 text-xs">
            <span
              className="bg-accent inline-block size-1.5 animate-pulse rounded-full"
              aria-hidden
            />
            polling every 3s while a run is active
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {filteredAudits.length === 0 ? (
          <p className="text-secondary border-border-subtle border-t px-[var(--card-padding)] py-10 text-center text-sm">
            {`No ${filterLabel} runs.`}
          </p>
        ) : (
          <RunsTable audits={filteredAudits} />
        )}
      </CardContent>
    </Card>
  );
}
