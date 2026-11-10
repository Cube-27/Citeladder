'use client';

import { ActionPriorityBadge, ActionStatusBadge } from '@/components/agent/action-status-badge';
import { ListScreen } from '@/components/layout/page-shell';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { DisplayTime } from '@/components/ui/display-time';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { TextLink } from '@/components/ui/text-link';
import { ClampText, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import {
  ACTION_STATUS_LABEL,
  ACTION_TARGET_KINDS,
  approachLabel,
  familyLabel,
  targetKindLabel,
} from '@/lib/agent/vocabulary';
import { actionsQueries, type actionsApi, type Action, type ActionStatus } from '@/lib/api/actions';
import { actionStatusSchema } from '@citeladder/contracts/actions';
import { queueCount, useActionStatusCounts } from '@/lib/agent/use-action-status-counts';
import { formatCount, readableUrl } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';

const QUEUE = 'queue';
type StatusFilter = typeof QUEUE | ActionStatus;
const STATUS_FILTERS: readonly StatusFilter[] = [QUEUE, ...actionStatusSchema.options];
const STATUS_CODEC = stringUrlCodec<StatusFilter>(STATUS_FILTERS, QUEUE);
const ALL_TARGETS = 'all';
const TARGET_CODEC = stringUrlCodec<string>([ALL_TARGETS, ...ACTION_TARGET_KINDS], ALL_TARGETS);

type StatusCounts = Partial<Record<string, number>>;

function statusCount(value: StatusFilter, counts: StatusCounts) {
  return value === QUEUE ? queueCount(counts) : (counts[value] ?? 0);
}

/**
 * Status choices, each with its project-wide count in the menu. The counts
 * cover every target type, so they are shown only while the target filter is
 * unset. The labels themselves never change, so the filter keeps its width
 * when the counts load or drop away.
 */
function statusOptions(counts: StatusCounts | undefined) {
  return STATUS_FILTERS.map((value) => ({
    value,
    label: value === QUEUE ? 'Open and in progress' : ACTION_STATUS_LABEL[value],
    detail: counts ? formatCount(statusCount(value, counts)) : undefined,
  }));
}
const TARGET_OPTIONS = [
  { value: ALL_TARGETS, label: 'All targets' },
  ...ACTION_TARGET_KINDS.map((kind) => ({ value: kind, label: targetKindLabel(kind) ?? kind })),
];

/**
 * Actions ordered by deterministic priority. The filters are shareable URL
 * state; the cursor stack is local and resets whenever a filter changes.
 */
export function ActionsScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const [status, setStatus] = useUrlState('status', STATUS_CODEC);
  const [target, setTarget] = useUrlState('target', TARGET_CODEC);
  const counts = useActionStatusCounts();
  return (
    <ListScreen
      controls={{
        filters: (
          <>
            <Select
              ariaLabel="Status"
              value={status}
              options={statusOptions(target === ALL_TARGETS ? counts : undefined)}
              onValueChange={(value) => setStatus(value, 'replace')}
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
        status={status === QUEUE ? undefined : status}
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
  const { page, table } = useCursorTableQuery({
    workspaceId,
    scopeId: projectId,
    scope: [status, targetKind],
    query: (request) =>
      actionsQueries.list(
        { workspaceId, projectId },
        { status, target_kind: targetKind, ...request },
      ),
    noun: 'Actions',
    loading: 'Loading Actions…',
    error: 'Actions could not be loaded.',
    empty: emptyActions,
  });
  return (
    // Every row stacks the target over its kind, so short pages pad with
    // two-line blanks and the pager stays where a full page puts it.
    <DataTable label="Actions" columns={COLUMNS} rowLines={2} {...table}>
      {page?.items.map((action) => (
        // A single-status filter makes every row the same status; the queue
        // mixes Open with In progress, so only the rows that are not Open
        // name theirs.
        <ActionRow
          key={action.id}
          action={action}
          showStatus={status === undefined && action.status !== 'open'}
        />
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
function emptyActions(page: Awaited<ReturnType<typeof actionsApi.list>>): DataTableState {
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

/**
 * The row's one-line work summary: what kind of target, how many findings
 * the Action groups and the areas they come from. The list read carries no
 * written summary, so it is built from those fields.
 */
function workSummary(action: Action): string {
  const findings = `${formatCount(action.member_count)} ${action.member_count === 1 ? 'finding' : 'findings'}`;
  const families = action.families.map(familyLabel).filter(Boolean).join(', ');
  return [
    targetKindLabel(action.target_kind),
    families ? `${findings} in ${families}` : findings,
    action.origin === 'agent' ? 'From agent work' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ActionRow({ action, showStatus }: Readonly<{ action: Action; showStatus: boolean }>) {
  return (
    <TableRow>
      <TableCell>
        <div className="grid min-w-0">
          <Inline>
            <ClampText lines={1} tooltip={readableUrl(action.target_label)}>
              <TextLink href={`/agent/actions/${action.id}`} text="itemTitle">
                {readableUrl(action.target_label)}
              </TextLink>
            </ClampText>
            {showStatus ? <ActionStatusBadge status={action.status} /> : null}
          </Inline>
          <ClampText lines={1} className={textRole('caption')}>
            {workSummary(action)}
          </ClampText>
        </div>
      </TableCell>
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
