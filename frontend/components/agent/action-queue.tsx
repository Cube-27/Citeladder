'use client';

import type { DataTableState } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import { ACTION_STATUS_LABEL, familyLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import { queueCount, useActionStatusCounts } from '@/lib/agent/use-action-status-counts';
import {
  actionsQueries,
  type Action,
  type ActionsPage,
  type ActionStatus,
} from '@/lib/api/actions';
import { formatCount } from '@/lib/format';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';
import type { ActionSurface } from '@citeladder/contracts/action-surface';
import { actionStatusSchema } from '@citeladder/contracts/actions';

/**
 * The parts the Actions and Content optimization lists share: the status
 * filter in the URL, its per-status counts, and the cursor-paged read of one
 * surface's Actions. Each screen adds its own columns and empty states.
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
 * Status choices, each with its surface-wide count in the menu. The labels
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
 * The shareable status filter of one surface's list. `status` is undefined
 * for the work queue (open and in progress).
 */
export function useActionStatusFilter() {
  const [filter, setFilter] = useUrlState('status', STATUS_CODEC);
  return { filter, setFilter, status: filter === QUEUE ? undefined : filter };
}

/**
 * The Status select of one surface's list, with that surface's counts in its
 * menu. The counts cover every target type, so a list narrowed by another
 * filter passes `showCounts={false}`.
 */
export function ActionStatusSelect({
  surface,
  value,
  onValueChange,
  showCounts = true,
}: Readonly<{
  surface: ActionSurface;
  value: StatusFilter;
  onValueChange: (value: StatusFilter) => void;
  showCounts?: boolean;
}>) {
  const counts = useActionStatusCounts(surface);
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
export function workSummary(action: Action): string {
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

/**
 * One surface's Actions as a cursor-paged table read, ordered by
 * deterministic priority. The cursor stack is local and resets whenever a
 * filter changes.
 */
export function useActionTable({
  workspaceId,
  projectId,
  surface,
  status,
  targetKind,
  noun,
  empty,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  surface: ActionSurface;
  status: ActionStatus | undefined;
  targetKind?: string;
  /** What the rows are, plural ("Actions"). */
  noun: string;
  empty: (page: ActionsPage) => DataTableState;
}>) {
  return useCursorTableQuery({
    workspaceId,
    scopeId: projectId,
    scope: [surface, status, targetKind],
    query: (request) =>
      actionsQueries.list(
        { workspaceId, projectId },
        { surface, status, target_kind: targetKind, ...request },
      ),
    noun,
    loading: `Loading ${noun}…`,
    error: `${noun} could not be loaded.`,
    empty,
  });
}
