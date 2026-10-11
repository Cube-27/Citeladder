/**
 * Prompt runs: every engine or search-surface answer spends one run of the
 * plan's period allowance, whichever key pays. Each task holds one run from
 * admission; only a recorded answer spends it, and any other terminal outcome
 * releases it.
 */
import type { Database } from '../db/database.ts';
import type { AuditTask } from '../queue/audit-queue.ts';
import { reserveUsages, debitUsage, releaseUsage, LedgerError } from '../entitlements/ledger.ts';
import { ApiError } from '../errors.ts';
import { policy } from '../config.ts';

export const PROMPT_RUNS = policy.entitlements.prompt_runs;

/**
 * Holds one run per task inserted in this transaction, in one ledger pass;
 * refuses them all when the allowance cannot cover every task.
 */
export async function reservePromptRuns(
  db: Database,
  {
    workspaceId,
    auditId,
    taskIds,
    at,
  }: {
    workspaceId: string;
    auditId: string;
    taskIds: readonly string[];
    at: Date;
  },
) {
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (!account)
    throw new ApiError(403, 'Billing entitlement is unavailable for this workspace', {
      code: 'entitlement_unresolved',
    });
  try {
    const reservationIds = await reserveUsages(db, {
      accountId: account.id,
      capability: PROMPT_RUNS,
      at,
      holds: taskIds.map((taskId) => ({
        units: 1,
        subject: { kind: 'audit', id: taskId, workspaceId, auditId },
        key: `run:${taskId}`,
      })),
    });
    return { accountId: account.id, reservationIds };
  } catch (error) {
    if (error instanceof LedgerError && error.message === 'funded_credits_exhausted')
      throw new ApiError(403, 'Your plan’s prompt runs for this period are used up', {
        code: 'prompt_runs_exhausted',
      });
    throw error;
  }
}

/** Spends the task's run when its answer was recorded; releases whatever is still held. */
export async function settlePromptRun(db: Database, task: AuditTask, success: boolean, at: Date) {
  const holds = await db
    .selectFrom('consumable_ledger')
    .select(['billing_account_id', 'reservation_id'])
    .distinct()
    .where('workspace_id', '=', task.workspace_id)
    .where('audit_id', '=', task.audit_id)
    .where('subject_kind', '=', 'audit')
    .where('subject_id', '=', task.id)
    .where('capability_key', '=', PROMPT_RUNS)
    .where('entry_kind', '=', 'reservation')
    .orderBy('billing_account_id')
    .orderBy('reservation_id')
    .execute();
  for (const hold of holds) {
    const request = {
      workspaceId: task.workspace_id,
      accountId: hold.billing_account_id,
      reservationId: hold.reservation_id,
      at,
    };
    const answer = {
      ...request,
      subjectId: task.id,
      attempt: 1,
      units: 1,
      key: `run:${hold.reservation_id}:answer`,
      dispatchKey: 'answer',
    };
    // Ledger writes share the transaction and its capacity lock, so they run in order.
    if (success) await debitUsage(db, answer); // NOSONAR
    await releaseUsage(db, { ...request, key: `run:${hold.reservation_id}:release` }); // NOSONAR
  }
}
