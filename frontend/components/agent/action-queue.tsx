'use client';

import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import type { DataTableState } from '@/components/ui/data-table';
import { Inline } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { ClampText, TableCell } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { ACTION_STATUS_LABEL, familyLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import { queueCount, useActionStatusCounts } from '@/lib/agent/use-action-status-counts';
import {
  actionsQueries,
  type Action,
  type ActionsPage,
  type ActionStatus,
} from '@/lib/api/actions';
import { formatCount, pluralCount, readableUrl } from '@/lib/format';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';
import { actionStatusSchema } from '@citeladder/contracts/actions';

/**
 * The Actions list's parts: the status filter in the URL, its per-status
 * counts, the cursor-paged read of the project's Actions and the target cell.
 */

const QUEUE = 'queue';
type StatusFilter = typeof QUEUE | ActionStatus;
const STATUS_FILTERS: readonly StatusFilter[] = [QUEUE, ...actionStatusSchema.options];
const STATUS_CODEC = stringUrlCodec<StatusFilter>(STATUS_FILTERS, QUEUE);

type StatusCounts = Partial<Record<string, number>>;

function statusCount(value: StatusFilter, counts: StatusCounts) {
  return value === QUEUE ? queueCount(counts) : (counts[value] ?? 0);
}

/**
 * Status choices, each with its project-wide count in the menu. The labels
 * themselves never change, so the filter keeps its width when the counts load
 * or drop away.
 */
function statusOptions(counts: StatusCounts | undefined) {
  return STATUS_FILTERS.map((value) => ({
    value,
    label: value === QUEUE ? 'Open and in progress' : ACTION_STATUS_LABEL[value],
    detail: counts ? formatCount(statusCount(value, counts)) : undefined,
  }));
}

/**
 * The shareable status filter of the Actions list. `status` is undefined
 * for the work queue (open and in progress).
 */
export function useActionStatusFilter() {
  const [filter, setFilter] = useUrlState('status', STATUS_CODEC);
  return { filter, setFilter, status: filter === QUEUE ? undefined : filter };
}

/**
 * The Status select of the Actions list, with the project's counts in its
 * menu. The counts cover every target type, so a list narrowed by another
 * filter passes `showCounts={false}`.
 */
export function ActionStatusSelect({
  value,
  onValueChange,
  showCounts = true,
}: Readonly<{
  value: StatusFilter;
  onValueChange: (value: StatusFilter) => void;
  showCounts?: boolean;
}>) {
  const counts = useActionStatusCounts();
  return (
    <Select
      ariaLabel="Status"
      value={value}
      options={statusOptions(showCounts ? counts : undefined)}
      onValueChange={onValueChange}
    />
  );
}

/**
 * A row's one-line work summary: what kind of target, how many findings
 * the Action groups and the areas they come from. The list read carries no
 * written summary, so it is built from those fields.
 */
function workSummary(action: Action): string {
  const findings = pluralCount(action.member_count, 'finding');
  const families = action.families.map(familyLabel).filter(Boolean).join(', ');
  return [
    targetKindLabel(action.target_kind),
    families ? `${findings} in ${families}` : findings,
    action.origin === 'agent' ? 'From agent work' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A row's target cell: the target linked to its Action, its
 * status beside it only in the work queue and only when it is not Open (the
 * queue is nearly all Open), and the work summary under it.
 */
export function ActionTargetCell({
  action,
  status,
}: Readonly<{
  action: Action;
  /** The list's status filter; undefined for the work queue. */
  status: ActionStatus | undefined;
}>) {
  // A page to create is named by its topic, so the label is not always a URL.
  const label = readableUrl(action.target_label);
  return (
    <TableCell>
      <div className="grid min-w-0">
        <Inline>
          <ClampText lines={1} tooltip={label}>
            <TextLink href={`/agent/actions/${action.id}`} text="itemTitle">
              {label}
            </TextLink>
          </ClampText>
          {status === undefined && action.status !== 'open' ? (
            <ActionStatusBadge status={action.status} />
          ) : null}
        </Inline>
        <ClampText lines={1} className={textRole('caption')}>
          {workSummary(action)}
        </ClampText>
      </div>
    </TableCell>
  );
}

/**
 * The project's Actions as a cursor-paged table read, ordered by
 * deterministic priority. The cursor stack is local and resets whenever a
 * filter changes.
 */
export function useActionTable({
  workspaceId,
  projectId,
  status,
  targetKind,
  noun,
  empty,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  status: ActionStatus | undefined;
  targetKind?: string;
  /** What the rows are, plural ("Actions"). */
  noun: string;
  empty: (page: ActionsPage) => DataTableState;
}>) {
  return useCursorTableQuery({
    workspaceId,
    scopeId: projectId,
    scope: [status, targetKind],
    query: (request) =>
      actionsQueries.list(
        { workspaceId, projectId },
        { status, target_kind: targetKind, ...request },
      ),
    noun,
    loading: `Loading ${noun}…`,
    error: `${noun} could not be loaded.`,
    empty,
  });
}
