'use client';

import {
  ActionStatusSelect,
  ActionTargetCell,
  useActionStatusFilter,
  useActionTable,
} from '@/components/agent/action-queue';
import { ActionPriorityBadge } from '@/components/agent/action-status-badge';
import { ListScreen } from '@/components/layout/page-shell';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { DisplayTime } from '@/components/ui/display-time';
import { Select } from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import { ACTION_TARGET_KINDS, approachLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import type { Action, ActionsPage, ActionStatus } from '@/lib/api/actions';
import { ICONS } from '@/lib/icons';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';

const ALL_TARGETS = 'all';
const TARGET_CODEC = stringUrlCodec<string>([ALL_TARGETS, ...ACTION_TARGET_KINDS], ALL_TARGETS);

const TARGET_OPTIONS = [
  { value: ALL_TARGETS, label: 'All targets' },
  ...ACTION_TARGET_KINDS.map((kind) => ({ value: kind, label: targetKindLabel(kind) ?? kind })),
];

/**
 * The Actions surface ordered by deterministic priority: every Action that
 * is not content work, which Content optimization lists instead. The filters
 * are shareable URL state.
 */
export function ActionsScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const { filter, setFilter, status } = useActionStatusFilter();
  const [target, setTarget] = useUrlState('target', TARGET_CODEC);
  return (
    <ListScreen
      controls={{
        filters: (
          <>
            <ActionStatusSelect
              surface="actions"
              value={filter}
              onValueChange={(value) => setFilter(value, 'replace')}
              // The counts cover every target type.
              showCounts={target === ALL_TARGETS}
            />
            <Select
              ariaLabel="Target type"
              value={target}
              options={TARGET_OPTIONS}
              onValueChange={(value) => setTarget(value, 'replace')}
            />
          </>
        ),
      }}
    >
      <ActionsList
        workspaceId={workspaceId}
        projectId={projectId}
        status={status}
        targetKind={target === ALL_TARGETS ? undefined : target}
      />
    </ListScreen>
  );
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
  const { page, table } = useActionTable({
    workspaceId,
    projectId,
    surface: 'actions',
    status,
    targetKind,
    noun: 'Actions',
    empty: emptyActions,
  });
  return (
    // Every row stacks the target over its kind, so short pages pad with
    // two-line blanks and the pager stays where a full page puts it.
    <DataTable label="Actions" columns={COLUMNS} rowLines={2} {...table}>
      {page?.items.map((action) => (
        <ActionRow key={action.id} action={action} status={status} />
      ))}
    </DataTable>
  );
}

// No status column: under the default queue nearly every row is Open, so a
// row names its status beside the target only when it differs (owner,
// 2026-11-10).
const COLUMNS: readonly DataTableColumn[] = [
  { key: 'target', label: 'Target' },
  { key: 'priority', label: 'Priority', width: 'status' },
  { key: 'approach', label: 'Approach', width: 'name' },
  { key: 'updated', label: 'Updated', width: 'date', numeric: true },
];

/** What a page with no Actions says: nothing matches, or nothing exists yet. */
function emptyActions(page: ActionsPage): DataTableState {
  const anyActions = Object.values(page.status_counts).some((count) => count > 0);
  return anyActions
    ? {
        kind: 'empty',
        icon: ICONS.opportunities,
        headingLevel: 3,
        heading: 'No Actions match these filters',
        description: 'Change the status or target type to see other Actions.',
      }
    : {
        kind: 'empty',
        icon: ICONS.opportunities,
        headingLevel: 3,
        heading: 'No Actions yet',
        description:
          'Actions appear when a crawl, visibility run or Search Console sync finds work on a target.',
      };
}

function ActionRow({
  action,
  status,
}: Readonly<{ action: Action; status: ActionStatus | undefined }>) {
  return (
    <TableRow>
      <ActionTargetCell action={action} status={status} />
      <TableCell className="whitespace-nowrap">
        <ActionPriorityBadge score={action.priority_score} />
      </TableCell>
      <TableCell>{approachLabel(action.approach) ?? ''}</TableCell>
      <TableCell numeric>
        <DisplayTime value={action.updated_at} dateOnly />
      </TableCell>
    </TableRow>
  );
}
