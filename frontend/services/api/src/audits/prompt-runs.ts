/**
 * Prompt runs: every engine or search-surface answer spends one run of the
 * plan's period allowance, whichever key pays. Each task holds one run from
 * admission; only a recorded answer spends it, and any other terminal outcome
 * releases it.
 */
import type { Database } from '../db/database.ts';
import type { AuditTask } from '../queue/audit-queue.ts';
import { holdAll, holdsOf, settle, LedgerError } from '../entitlements/ledger.ts';
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
  try {
    return await holdAll(db, {
      workspaceId,
      capability: PROMPT_RUNS,
      at,
      holds: taskIds.map((taskId) => ({
        units: 1,
        subject: { kind: 'audit', id: taskId, workspaceId, auditId },
      })),
    });
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'account_not_found')
      throw new ApiError(403, 'Billing entitlement is unavailable for this workspace', {
        code: 'entitlement_unresolved',
      });
    if (error instanceof LedgerError && error.code === 'funded_credits_exhausted')
      throw new ApiError(403, 'Your plan’s prompt runs for this period are used up', {
        code: 'prompt_runs_exhausted',
      });
    throw error;
  }
}

/** Spends the task's run when its answer was recorded; releases whatever is still held. */
export async function settlePromptRun(db: Database, task: AuditTask, success: boolean, at: Date) {
  const subject = {
    kind: 'audit',
    id: task.id,
    workspaceId: task.workspace_id,
    auditId: task.audit_id,
  } as const;
  for (const reservationId of await holdsOf(db, subject, PROMPT_RUNS))
    // Settlements share the transaction and its capacity lock, so they run in order.
    await settle(db, {
      workspaceId: task.workspace_id,
      reservationId,
      spent: success ? 1 : 0,
      attempt: 1,
      dispatch: 'answer',
      at,
    }); // NOSONAR
}
