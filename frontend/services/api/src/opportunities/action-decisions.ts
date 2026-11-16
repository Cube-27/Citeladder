/**
 * A user's status decisions on Actions: Accept (`in_progress`), Decline
 * (`dismissed`) and Restore (`open`), one at a time or in bulk, each appending
 * an `action_status_events` row in the caller's transaction. Work with Agent
 * on a New Action accepts it. Done is only declared (`declarations.ts`).
 */
import { randomUUID } from 'node:crypto';
import type { ActionBulkStatusRequest, ActionUserStatus } from '@citeladder/contracts/actions';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import type { RecordScope } from '../db/workspace-scope.ts';
import { ApiError } from '../errors.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import { refreshActionStatus } from './action-status.ts';
import {
  actionItem,
  LIVE_TARGET_KIND,
  matchingActions,
  requireAction,
  type ActionRow,
} from './actions.ts';
import type { Scope } from './sources.ts';

const a = policy.opportunity.actions;
const TRANSITIONS = new Map<string, readonly string[]>(Object.entries(a.ACTION_TRANSITIONS));

/** Whether a user decision may move an Action stored as `from` to `to`. */
const allowed = (from: string, to: string) => TRANSITIONS.get(from)?.includes(to) ?? false;

/** Store `status` with its event and refresh the effective status; caller holds the row lock. */
export async function recordStatus(
  db: Database,
  action: ActionRow,
  status: string,
  userId: string,
) {
  if (action.status === status) return;
  const now = new Date();
  await db
    .updateTable('actions')
    .set({ status, updated_at: now })
    .where('workspace_id', '=', action.workspace_id)
    .where('id', '=', action.id)
    .execute();
  await db
    .insertInto('action_status_events')
    .values({
      id: randomUUID(),
      workspace_id: action.workspace_id,
      project_id: action.project_id,
      action_id: action.id,
      previous_status: action.status,
      next_status: status,
      changed_by_user_id: userId,
      created_at: now,
    })
    .execute();
  await refreshActionStatus(db, action.workspace_id, action.id);
}

/** One decision; repeating the current status is a no-op, an illegal move a 422. */
export async function updateActionStatus(
  db: Database,
  scope: RecordScope,
  actionId: string,
  status: ActionUserStatus,
  userId: string,
) {
  await inTransaction(db, async (trx) => {
    const action = await requireAction(trx, scope, actionId, true);
    if (action.status === status) return;
    if (action.status === a.ACTION_STATUS_IMPLEMENTED)
      throw new ApiError(422, 'A declared Action cannot be changed');
    if (!allowed(action.status, status))
      throw new ApiError(422, `An Action cannot move from ${action.status} to ${status}`);
    await recordStatus(trx, action, status, userId);
  });
  return actionItem(await requireAction(db, scope, actionId));
}

/**
 * One decision on the named Actions or on the first `ACTION_BULK_MAX` the
 * filter matches, highest priority first, in one transaction. The project lock
 * comes first, as in the refresh that locks every Action row in no set order,
 * so the two cannot deadlock; an Action outside the project's workspace is
 * never read, so it is only ever counted skipped.
 */
export async function bulkUpdateActionStatus(
  db: Database,
  scope: Scope,
  input: ActionBulkStatusRequest,
  userId: string,
) {
  return inTransaction(db, async (trx) => {
    await acquireProjectLock(trx, scope.projectId);
    let named = 0;
    let candidates: string[];
    let truncated = false;
    if (input.ids) {
      const ids = [...new Set(input.ids)];
      named = ids.length;
      candidates = ids;
    } else if (input.filter) {
      const rows = await matchingActions(trx, scope, input.filter)
        .select('id')
        .orderBy(sql`coalesce(actions.priority_score, -1)`, 'desc')
        .orderBy('id')
        .limit(a.ACTION_BULK_MAX + 1)
        .execute();
      truncated = rows.length > a.ACTION_BULK_MAX;
      candidates = rows.slice(0, a.ACTION_BULK_MAX).map((row) => row.id);
      named = candidates.length;
    } else {
      throw new ApiError(422, 'Name either ids or a filter');
    }
    const locked = candidates.length
      ? await trx
          .selectFrom('actions')
          .selectAll()
          .where('workspace_id', '=', scope.workspaceId)
          .where('project_id', '=', scope.projectId)
          .where('id', 'in', candidates)
          .where(LIVE_TARGET_KIND)
          .orderBy('id')
          .forUpdate()
          .execute()
      : [];
    let updated = 0;
    for (const action of locked) {
      if (!allowed(action.status, input.to)) continue;
      await recordStatus(trx, action, input.to, userId);
      updated += 1;
    }
    return { updated, skipped: named - updated, truncated };
  });
}

/**
 * Work with Agent: a chat started on a New Action accepts it. Any other
 * status is left as it is. Caller owns the transaction; the non-key lock
 * leaves the chat's own foreign key to the Action unblocked.
 */
export async function acceptForAgent(db: Database, scope: Scope, actionId: string, userId: string) {
  const action = await db
    .selectFrom('actions')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('id', '=', actionId)
    .forNoKeyUpdate()
    .executeTakeFirst();
  if (action?.status === a.ACTION_STATUS_OPEN)
    await recordStatus(db, action, a.ACTION_STATUS_IN_PROGRESS, userId);
}
