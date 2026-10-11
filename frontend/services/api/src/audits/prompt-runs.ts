/**
 * Prompt runs: every engine or search-surface answer spends one run of the
 * plan's period allowance, whichever key pays. Each task holds one run from
 * admission; only a recorded answer spends it, and any other terminal outcome
 * releases it.
 */
import type { Database } from '../db/database.ts';
import type { AuditTask } from '../queue/audit-queue.ts';
import { reserveUsage, debitUsage, releaseUsage, LedgerError } from '../entitlements/ledger.ts';
import { ApiError } from '../errors.ts';
import { policy } from '../config.ts';

export const PROMPT_RUNS = policy.entitlements.prompt_runs;

/** Holds one run for a task inserted in this transaction; refuses when the allowance is spent. */
export async function reservePromptRun(
  db: Database,
  {
    workspaceId,
    auditId,
    taskId,
    at,
  }: {
    workspaceId: string;
    auditId: string;
    taskId: string;
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
    const reservationId = await reserveUsage(db, {
      accountId: account.id,
      capability: PROMPT_RUNS,
      units: 1,
      subject: { kind: 'audit', id: taskId, workspaceId, auditId },
      key: `run:${taskId}`,
      at,
    });
    return { accountId: account.id, reservationId };
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
    if (success)
      await debitUsage(db, {
        ...request,
        subjectId: task.id,
        attempt: 1,
        units: 1,
        key: `run:${hold.reservation_id}:answer`,
        dispatchKey: 'answer',
      });
    await releaseUsage(db, { ...request, key: `run:${hold.reservation_id}:release` });
  }
}
