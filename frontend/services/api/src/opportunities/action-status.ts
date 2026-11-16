/**
 * The Action status a reader sees, persisted on `actions.effective_status`.
 *
 * A user decision stores `open`, `in_progress` or `dismissed` and a
 * declaration stores `implemented`, which reads as measuring once the
 * verifier observed it and as done (verified) while the latest observation,
 * which folds every check's own latest reading, verified every check. A chat
 * output never changes it. `ACTION_STATUS_VIEW` maps each persisted value to
 * the status a user sees (New, In progress, Done, Declined) and its
 * measurement badge.
 *
 * Each writer that changes one of those inputs (a status decision or
 * declaration, a verification observation) calls `refreshActionStatus` in its
 * own transaction, so every read, filter and count selects one indexed column
 * instead of re-deriving it.
 */
import { actionStatusSchema, type ActionStatus } from '@citeladder/contracts/actions';
import { sql, type RawBuilder, type SqlBool } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { compareText } from '../text-order.ts';

const a = policy.opportunity.actions;
type StatusView = (typeof a.ACTION_STATUS_VIEW)[keyof typeof a.ACTION_STATUS_VIEW];
const VIEWS = new Map<string, StatusView>(Object.entries(a.ACTION_STATUS_VIEW));

/** The status and measurement badge a persisted effective status reads as. */
export function statusView(effective: string): StatusView {
  const view = VIEWS.get(effective);
  if (!view) throw new Error(`Unknown persisted action status: ${effective}`);
  return view;
}

/** The persisted effective statuses that read as one of `statuses`, sorted. */
export function persistedStatuses(statuses: readonly ActionStatus[]): string[] {
  return Object.entries(a.ACTION_STATUS_VIEW)
    .filter(([, view]) => statuses.includes(view.status))
    .map(([persisted]) => persisted)
    .sort(compareText);
}

/** The effective status of the `actions` row being updated, from its inputs. */
function derivedStatus(): RawBuilder<string> {
  // One lookup of the latest observation, read only for a declared Action.
  const measured = sql`(
    select case when ve.observation_kind = 'verified'
      then ${a.ACTION_STATUS_DONE}::varchar else ${a.ACTION_STATUS_MEASURING}::varchar end
    from opportunity_verification_events ve
    join opportunity_implementation_events ie on ie.id = ve.implementation_event_id
    where ie.action_id = actions.id
      and ie.workspace_id = actions.workspace_id
      and ie.project_id = actions.project_id
      and ve.workspace_id = ie.workspace_id
      and ve.project_id = ie.project_id
    order by ve.created_at desc, ve.id desc
    limit 1
  )`;
  return sql<string>`case
    when actions.status = ${a.ACTION_STATUS_IMPLEMENTED}
      then coalesce(${measured}, ${a.ACTION_STATUS_IMPLEMENTED}::varchar)
    else actions.status
  end`;
}

/**
 * Recompute one Action's persisted effective status inside the caller's
 * transaction. The row is locked first so the recompute, a separate
 * statement, reads every input committed before it, including a concurrent
 * writer's that held the lock. `FOR NO KEY UPDATE` serializes refreshers
 * without conflicting with the key-share lock a writer's own foreign key to
 * the Action already holds (an output or event linked to it), so upgrading
 * from that lock cannot deadlock behind a queued status update.
 */
export async function refreshActionStatus(
  db: Database,
  workspaceId: string,
  actionId: string,
): Promise<void> {
  await db
    .selectFrom('actions')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', actionId)
    .forNoKeyUpdate()
    .execute();
  await db
    .updateTable('actions')
    .set({ effective_status: derivedStatus() })
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', actionId)
    .where(sql<SqlBool>`effective_status is distinct from ${derivedStatus()}`)
    .execute();
}

/**
 * Opportunities whose Action has `status`; by default the work queue. A row
 * recomputed before Actions existed has no Action and stays in the queue.
 */
export function opportunityStatusClause(status: ActionStatus | null): RawBuilder<SqlBool> {
  if (status) {
    return sql<SqlBool>`opportunities.action_id in (
      select actions.id from actions
      where actions.workspace_id = opportunities.workspace_id
        and actions.project_id = opportunities.project_id
        and actions.effective_status in (${sql.join(persistedStatuses([status]))})
    )`;
  }
  const active = [...a.ACTION_ACTIVE_STATUSES].sort(compareText);
  return sql<SqlBool>`(opportunities.action_id is null or opportunities.action_id in (
    select actions.id from actions
    where actions.workspace_id = opportunities.workspace_id
      and actions.project_id = opportunities.project_id
      and actions.effective_status in (${sql.join(active)})
  ))`;
}

/** `status` as a user status; an unknown one is a 422, never an empty list. */
export function validateStatus(status: string): ActionStatus {
  const parsed = actionStatusSchema.safeParse(status);
  if (!parsed.success) throw new ApiError(422, `unknown action status: ${status}`);
  return parsed.data;
}
