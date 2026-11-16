/**
 * The Actions page's groupings as SQL over persisted Action columns (plan v3):
 * the goal and grouping action sync stored, and the keys the tree can group
 * by. A row not yet synced since groupings were persisted reads as the
 * fallback grouping. Nothing here derives a grouping from evidence.
 */
import {
  actionGoalSchema,
  type ActionGoal,
  type ActionGrouping,
  type ActionTreeGroupBy,
} from '@citeladder/contracts/actions';
import { sql, type RawBuilder } from 'kysely';

import { policy } from '../config.ts';

const a = policy.opportunity.actions;

/** The goal a grouping sits under (`ACTION_GOALS`). */
export function goalOf(grouping: ActionGrouping): ActionGoal {
  const groupings: Record<ActionGoal, readonly ActionGrouping[]> = a.ACTION_GOALS;
  return actionGoalSchema.options.find((goal) => groupings[goal].includes(grouping))!;
}

export const FALLBACK_GOAL: ActionGoal = goalOf(a.ACTION_GROUPING_FALLBACK);

/** Every grouping in page order: goals in order, then each goal's groupings. */
export const GROUPING_ORDER: readonly ActionGrouping[] = Object.values(a.ACTION_GOALS).flat();

export const goalSql = sql<ActionGoal>`coalesce(actions.goal, ${FALLBACK_GOAL})`;
export const groupingSql = sql<ActionGrouping>`coalesce(actions.goal_grouping, ${a.ACTION_GROUPING_FALLBACK})`;

/** Owned work, or earned mentions elsewhere. */
export const ownershipSql = sql<string>`(case when ${goalSql} = 'mentions' then 'earned' else 'owned' end)`;

/**
 * The Impact band (`ACTION_PRIORITY_BANDS`). The tree files an unscored Action
 * (an Agent row) as low, where it ranks last, as the list's `priority=low` reads it.
 */
export const impactSql = sql<string>`(case
  when actions.priority_score >= ${a.ACTION_PRIORITY_BANDS.high} then 'high'
  when actions.priority_score >= ${a.ACTION_PRIORITY_BANDS.medium} then 'medium'
  else 'low' end)`;

/** The prompt theme of the Action's strongest live finding; '' when it has none. */
export const topicSql = sql<string>`coalesce((select o.target_theme from opportunities o
  where o.workspace_id = actions.workspace_id and o.action_id = actions.id
    and o.superseded_at is null and o.target_theme is not null
  order by o.priority_score desc nulls last, o.id limit 1), '')`;

/** What to do: the diagnosed approach; '' for an Agent row not diagnosed yet. */
const approachSql = sql<string>`actions.approach`;

/** The tree's first level for each `group_by`. */
export function groupKeySql(groupBy: ActionTreeGroupBy): RawBuilder<string> {
  switch (groupBy) {
    case 'goal':
      return goalSql;
    case 'what_to_do':
      return approachSql;
    case 'impact':
      return impactSql;
    case 'ownership':
      return ownershipSql;
    case 'topic':
      return topicSql;
    default: {
      const unknown: never = groupBy;
      return unknown;
    }
  }
}
