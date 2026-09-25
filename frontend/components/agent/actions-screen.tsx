'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { CursorPager } from '@/components/ui/cursor-pager';
import { EmptyState } from '@/components/ui/empty-state';
import { ReadError } from '@/components/ui/read-error';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MissingValue } from '@/components/ui/unavailable-value';
import { textRole } from '@/components/ui/typography';
import {
  ACTION_STATUS_LABEL,
  ACTION_TARGET_KINDS,
  approachLabel,
  targetKindLabel,
} from '@/lib/agent/vocabulary';
import { actionsQueries, type Action, type ActionStatus } from '@/lib/api/actions';
import { actionStatusSchema } from '@/lib/api/schemas/actions';
import { AGENT_ACTIONS_PAGE_SIZE } from '@/lib/config/agent';
import { ICONS } from '@/lib/icons';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectContext } from '@/lib/project/project-context';

const QUEUE = 'queue';
type StatusFilter = typeof QUEUE | ActionStatus;
const STATUS_FILTERS: readonly StatusFilter[] = [QUEUE, ...actionStatusSchema.options];
const STATUS_CODEC = stringUrlCodec<StatusFilter>(STATUS_FILTERS, QUEUE);
const ALL_TARGETS = 'all';
const TARGET_CODEC = stringUrlCodec<string>([ALL_TARGETS, ...ACTION_TARGET_KINDS], ALL_TARGETS);

const STATUS_OPTIONS = STATUS_FILTERS.map((value) => ({
  value,
  label: value === QUEUE ? 'Open and in progress' : ACTION_STATUS_LABEL[value],
}));
const TARGET_OPTIONS = [
  { value: ALL_TARGETS, label: 'All targets' },
  ...ACTION_TARGET_KINDS.map((kind) => ({ value: kind, label: targetKindLabel(kind) ?? kind })),
];

/**
 * Actions ordered by deterministic priority. The filters are shareable URL
 * state; the cursor stack is local and resets whenever a filter changes.
 */
export function ActionsScreen() {
  const { activeProjectId, activeWorkspaceId, isLoading } = useProjectContext();
  const [status, setStatus] = useUrlState('status', STATUS_CODEC);
  const [target, setTarget] = useUrlState('target', TARGET_CODEC);
  return (
    <PageShell
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            ariaLabel="Status"
            value={status}
            options={STATUS_OPTIONS}
            onValueChange={(value) => setStatus(value, 'replace')}
          />
          <Select
            ariaLabel="Target type"
            value={target}
            options={TARGET_OPTIONS}
            onValueChange={(value) => setTarget(value, 'replace')}
          />
        </div>
      }
    >
      {activeProjectId && activeWorkspaceId ? (
        <ActionsList
          key={`${activeProjectId}:${status}:${target}`}
          workspaceId={activeWorkspaceId}
          projectId={activeProjectId}
          status={status === QUEUE ? undefined : status}
          targetKind={target === ALL_TARGETS ? undefined : target}
        />
      ) : (
        <ProjectRequired loading={isLoading} />
      )}
    </PageShell>
  );
}

function ProjectRequired({ loading }: Readonly<{ loading: boolean }>) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  return <Alert tone="info">Select or create a project to see its Actions.</Alert>;
}

function ActionsList({
  workspaceId,
  projectId,
  status,
  targetKind,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  status?: ActionStatus;
  targetKind?: string;
}>) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const query = useQuery(
    actionsQueries.list(workspaceId, projectId, {
      status,
      target_kind: targetKind,
      cursor,
      limit: AGENT_ACTIONS_PAGE_SIZE,
    }),
  );

  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.isError)
    return (
      <ReadError
        error={query.error}
        fallback="Actions could not be loaded."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  const page = query.data;
  if (page.items.length === 0) {
    const anyActions = Object.values(page.status_counts).some((count) => count > 0);
    return anyActions ? (
      <EmptyState
        icon={ICONS.opportunities}
        variant="compact"
        heading="No Actions match these filters"
        description="Change the status or target type to see other Actions."
      />
    ) : (
      <EmptyState
        icon={ICONS.opportunities}
        heading="No Actions yet"
        description="Actions appear when a crawl, visibility run or Search Console sync finds work on a target."
      />
    );
  }
  const next = page.next_cursor;
  return (
    <div className="grid gap-3" aria-busy={query.isFetching || undefined}>
      <ActionsTable actions={page.items} />
      {cursors.length > 0 || next ? (
        <div className="flex items-center justify-end gap-2">
          <CursorPager
            page={cursors.length + 1}
            canPrev={cursors.length > 0}
            canNext={Boolean(next)}
            onPrev={() => setCursors((stack) => stack.slice(0, -1))}
            onNext={() => next && setCursors((stack) => [...stack, next])}
          />
        </div>
      ) : null}
    </div>
  );
}

function ActionsTable({ actions }: Readonly<{ actions: Action[] }>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Target</TableHead>
          <TableHead>Status</TableHead>
          <TableHead numeric>Priority</TableHead>
          <TableHead numeric>Evidence systems</TableHead>
          <TableHead>Approach</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {actions.map((action) => (
          <TableRow key={action.id}>
            <TableCell>
              <div className="grid min-w-0 gap-0.5">
                <ProjectLink
                  href={`/agent/actions/${action.id}`}
                  className={textRole('bodyStrong', 'hover:text-accent-text truncate')}
                >
                  {action.target_label}
                </ProjectLink>
                <span className={textRole('meta')}>
                  {[
                    targetKindLabel(action.target_kind),
                    action.origin === 'agent' ? 'From agent work' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <ActionStatusBadge status={action.status} />
            </TableCell>
            <TableCell numeric>
              {action.priority_score === null ? (
                <MissingValue state="not_measured" reason="No evidence scores this target yet." />
              ) : (
                action.priority_score.toFixed(1)
              )}
            </TableCell>
            <TableCell numeric>{action.families.length}</TableCell>
            <TableCell>{approachLabel(action.approach) ?? ''}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
