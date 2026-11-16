import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import type { useActionFilters } from '@/components/agent/use-action-filters';
import { useToast } from '@/components/ui/toast';
import { groupingKey, groupingParams, moveOut, type GroupingRef } from '@/lib/agent/action-tree';
import { ACTION_STATUS_LABEL } from '@/lib/agent/vocabulary';
import {
  actionsMutations,
  actionsQueries,
  type ActionsPage,
  type ActionStatus,
  type ActionTree,
  type ActionTreeParams,
} from '@/lib/api/actions';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { pluralCount } from '@/lib/format';
import {
  ACTION_BULK_MAX,
  actionBulkFilterSchema,
  type ActionUserStatus,
} from '@citeladder/contracts/actions';

export type ActionsView = ReturnType<typeof useActionFilters>;

const treeParams = (view: ActionsView, status: ActionStatus): ActionTreeParams => ({
  ...view.filters,
  status,
  group_by: view.groupBy,
});

/** Whether a previous read was for this workspace's project, so its rows may stand in. */
function sameProject(key: unknown, { workspaceId, projectId }: ProjectScope): boolean {
  return Array.isArray(key) && key.includes(workspaceId) && key.includes(projectId);
}

/**
 * One status section's tree: one read per status, grouping and filter set.
 * A changed grouping or filter keeps this project's last tree on screen
 * until the next lands, so nothing collapses while it loads.
 */
export function useStatusTree(
  scope: ProjectScope,
  view: ActionsView,
  status: ActionStatus,
  enabled = true,
) {
  return useQuery({
    ...actionsQueries.tree(scope, treeParams(view, status)),
    enabled,
    placeholderData: (previous: ActionTree | undefined, query?: { queryKey: unknown }) =>
      sameProject(query?.queryKey, scope) ? previous : undefined,
  });
}

/** Which levels are open: the defaults (the first status, group and grouping) unless closed. */
export function useOpenLevels(defaults: readonly string[]) {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const isOpen = (key: string) => opened.has(key) || (defaults.includes(key) && !closed.has(key));
  const set = (keys: readonly string[], open: boolean) => {
    const edit = (current: ReadonlySet<string>, add: boolean) => {
      const next = new Set(current);
      for (const key of keys) {
        if (add) next.add(key);
        else next.delete(key);
      }
      return next;
    };
    setOpened((current) => edit(current, open));
    setClosed((current) => edit(current, !open));
  };
  return {
    isOpen,
    toggle: (key: string) => set([key], !isOpen(key)),
    open: (keys: readonly string[]) => set(keys, true),
  };
}

/**
 * The ticked rows (each under its grouping) and groupings, kept only while
 * the view they were ticked in stays. A ticked grouping covers its ticked
 * rows, so they are neither counted nor sent twice.
 */
export function useTreeSelection(viewKey: string) {
  const empty = () => ({
    viewKey,
    rows: new Map<string, GroupingRef>(),
    groupings: new Map<string, GroupingRef & { count: number }>(),
  });
  const [state, setState] = useState(empty);
  const current = state.viewKey === viewKey ? state : empty();
  const hasGrouping = (ref: GroupingRef) => current.groupings.has(groupingKey(ref));
  const rows = new Map([...current.rows].filter(([, ref]) => !hasGrouping(ref)));
  const size = [...current.groupings.values()].reduce((sum, ref) => sum + ref.count, rows.size);
  return {
    /** Ticked rows outside every ticked grouping: the ones a decision names by id. */
    rows,
    groupings: current.groupings,
    size,
    hasRow: (id: string) => current.rows.has(id),
    hasRowIn: (ref: GroupingRef) =>
      [...rows.values()].some((row) => groupingKey(row) === groupingKey(ref)),
    hasGrouping,
    toggleRow: (id: string, ref: GroupingRef) =>
      setState({ ...current, rows: toggled(current.rows, id, ref) }),
    toggleGrouping: (ref: GroupingRef, count: number) =>
      setState({
        ...current,
        groupings: toggled(current.groupings, groupingKey(ref), { ...ref, count }),
      }),
    clear: () => setState(empty()),
  };
}

function toggled<V>(map: ReadonlyMap<string, V>, key: string, value: V): Map<string, V> {
  const next = new Map(map);
  if (!next.delete(key)) next.set(key, value);
  return next;
}

type Selection = ReturnType<typeof useTreeSelection>;

/**
 * Accept or Decline the ticked rows and groupings: each status's tree moves
 * them out at once, the server is asked (a grouping by its filter, rows by
 * id), and every Actions read refetches to settle the counts on its answer.
 */
export function useBulkDecision(scope: ProjectScope, view: ActionsView, selection: Selection) {
  const client = useQueryClient();
  const toast = useToast();
  const bulk = useMutation(actionsMutations.bulkStatus(scope));
  const decide = async (to: ActionUserStatus) => {
    const { rows, groupings } = selection;
    // Every request is built before the list changes, so a bad filter changes nothing.
    const filters = [...groupings.values()].flatMap((ref) => {
      const parsed = actionBulkFilterSchema.safeParse(
        groupingParams({ ref, groupBy: view.groupBy, filters: view.filters }),
      );
      return parsed.success ? [parsed.data] : [];
    });
    if (filters.length !== groupings.size) {
      toast.notify("Couldn't change these actions", 'Nothing was changed.', { tone: 'negative' });
      return;
    }
    const bodies = [
      ...filters.map((filter) => ({ to, filter })),
      ...chunks([...rows.keys()], ACTION_BULK_MAX).map((chunk) => ({ to, ids: chunk })),
    ];
    const statuses = new Set<ActionStatus>(
      [...rows.values(), ...groupings.values()].map((ref) => ref.status),
    );
    const ids = new Set(rows.keys());
    const keys = new Set(groupings.keys());
    const trees = [...statuses].map((from) => ({
      from,
      key: actionsQueries.tree(scope, treeParams(view, from)).queryKey,
    }));
    await Promise.all(trees.map(({ key }) => client.cancelQueries({ queryKey: key })));
    for (const { from, key } of trees)
      client.setQueryData(key, (tree) =>
        tree ? moveOut({ tree, from, to, ids, groupings: keys }) : tree,
      );
    client.setQueriesData<InfiniteData<ActionsPage>>(
      { queryKey: queryKeys.actions.read('grouping-rows', scope) },
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => !ids.has(item.id)),
          })),
        },
    );
    selection.clear();
    try {
      const results = await Promise.all(bodies.map((body) => bulk.mutateAsync(body)));
      const updated = results.reduce((sum, result) => sum + result.updated, 0);
      toast.notify(
        `${pluralCount(updated, 'action')} moved to ${ACTION_STATUS_LABEL[to]}`,
        results.some((result) => result.truncated)
          ? 'More are in these groupings: select them again for the rest.'
          : undefined,
      );
    } catch {
      toast.notify("Couldn't change these actions", 'The list shows their current status.', {
        tone: 'negative',
      });
    }
  };
  return { decide, pending: bulk.isPending };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    out.push(items.slice(start, start + size));
  return out;
}
