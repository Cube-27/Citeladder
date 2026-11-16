/**
 * The Actions page's tree as data: what one grouping's rows are read under,
 * and the optimistic move of ticked Actions out of a status before the server
 * answers. The tree read (`GET /actions/tree`) is the only source; nothing
 * here derives a grouping or a count the server did not send.
 */
import type {
  ActionGroupingParams,
  ActionStatus,
  ActionTree,
  ActionTreeFilters,
  ActionTreeGroupBy,
} from '@/lib/api/actions';
import type { ActionUserStatus } from '@citeladder/contracts/actions';

export type TreeGroup = ActionTree['groups'][number];
export type TreeGrouping = TreeGroup['groupings'][number];

/** One grouping of one status section, as the bulk bar and "Show more" name it. */
export type GroupingRef = Readonly<{
  status: ActionStatus;
  groupKey: string;
  grouping: TreeGrouping['grouping'];
}>;

export const groupingKey = (ref: GroupingRef) => `${ref.status}|${ref.groupKey}|${ref.grouping}`;

/** The filter a group of `groupBy` adds to its groupings' reads, as the server's cursor expects. */
function groupFilter(groupBy: ActionTreeGroupBy, key: string) {
  switch (groupBy) {
    case 'goal':
      return {};
    case 'what_to_do':
      return { approach: key };
    case 'impact':
      return { priority: key };
    case 'ownership':
      return { ownership: key };
    case 'topic':
      return { topic: key };
    default: {
      const unreachable: never = groupBy;
      return unreachable;
    }
  }
}

/** The list read one grouping's rows come from: the tree's filters, its group's and the grouping. */
export function groupingParams({
  ref,
  groupBy,
  filters,
}: Readonly<{
  ref: GroupingRef;
  groupBy: ActionTreeGroupBy;
  filters: ActionTreeFilters;
}>): ActionGroupingParams {
  return {
    ...filters,
    ...groupFilter(groupBy, ref.groupKey),
    status: ref.status,
    grouping: ref.grouping,
  };
}

const OPEN: ReadonlySet<ActionStatus> = new Set(['open', 'in_progress']);

/**
 * `tree` (the `from` status's) with the ticked Actions and whole ticked
 * groupings moved to `to`: their rows and counts leave their groupings, the
 * status counts move, and the goal strip's open counts follow when the move
 * crosses open (New and In progress) and closed.
 */
export function moveOut({
  tree,
  from,
  to,
  ids,
  groupings,
}: Readonly<{
  tree: ActionTree;
  from: ActionStatus;
  to: ActionUserStatus;
  ids: ReadonlySet<string>;
  groupings: ReadonlySet<string>;
}>): ActionTree {
  const goalDelta = new Map<string, number>();
  let moved = 0;
  const groups = tree.groups.flatMap((group) => {
    let groupMoved = 0;
    const kept = group.groupings.flatMap((grouping) => {
      const whole = groupings.has(groupingKey({ status: from, groupKey: group.key, ...grouping }));
      const items = whole ? [] : grouping.items.filter((item) => !ids.has(item.id));
      const gone = whole ? grouping.count : grouping.items.length - items.length;
      if (gone === 0) return [grouping];
      groupMoved += gone;
      const goal = grouping.items[0]?.goal ?? (tree.group_by === 'goal' ? group.key : null);
      if (goal) goalDelta.set(goal, (goalDelta.get(goal) ?? 0) + gone);
      const count = grouping.count - gone;
      return count > 0 ? [{ ...grouping, items, count }] : [];
    });
    moved += groupMoved;
    const count = group.count - groupMoved;
    return count > 0 ? [{ ...group, count, groupings: kept }] : [];
  });
  if (moved === 0) return tree;
  const sign = Number(OPEN.has(to)) - Number(OPEN.has(from));
  return {
    ...tree,
    status_counts: {
      ...tree.status_counts,
      [from]: Math.max(0, (tree.status_counts[from] ?? 0) - moved),
      [to]: (tree.status_counts[to] ?? 0) + moved,
    },
    goals: tree.goals.map((goal) => ({
      ...goal,
      count: Math.max(0, goal.count + sign * (goalDelta.get(goal.goal) ?? 0)),
    })),
    groups,
  };
}
