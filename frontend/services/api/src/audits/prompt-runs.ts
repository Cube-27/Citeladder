import type { Database } from '../db/database.ts';
import type { AuditTask } from '../queue/audit-queue.ts';
import { holdAll, holdsOf, settle, LedgerError } from '../entitlements/ledger.ts';
import { ApiError } from '../errors.ts';
import { policy } from '../config.ts';

export const PROMPT_RUNS = policy.entitlements.prompt_runs;
const AI_CREDITS = policy.entitlements.ai_credits;
export const TASK_CAPABILITIES = [PROMPT_RUNS, AI_CREDITS];

export function taskFunding(auditScope: string, engine: string, byok: boolean) {
  if (auditScope !== policy.probes.audit_scope) return { capability: PROMPT_RUNS, units: 1 };
  return { capability: AI_CREDITS, units: probeAnswerCredits(engine, byok) };
}

export function probeAnswerCredits(engine: string, byok: boolean) {
  const answer = policy.probes.answer_credits[engine];
  if (answer === undefined) throw new Error(`${engine} cannot run a probe`);
  return policy.probes.label_credits + (byok ? 0 : answer);
}

export async function reserveTaskFunding(
  db: Database,
  {
    workspaceId,
    auditId,
    capability,
    tasks,
    at,
  }: {
    workspaceId: string;
    auditId: string;
    capability: string;
    tasks: readonly { id: string; units: number }[];
    at: Date;
  },
) {
  try {
    return await holdAll(db, {
      workspaceId,
      capability,
      at,
      holds: tasks.map((task) => ({
        units: task.units,
        subject: { kind: 'audit', id: task.id, workspaceId, auditId },
      })),
    });
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'account_not_found')
      throw new ApiError(403, 'Billing entitlement is unavailable for this workspace', {
        code: 'entitlement_unresolved',
      });
    if (error instanceof LedgerError && error.code === 'funded_credits_exhausted')
      throw capability === AI_CREDITS
        ? new ApiError(403, 'Your AI credits are used up', { code: 'ai_credits_exhausted' })
        : new ApiError(403, 'Your plan’s prompt runs for this period are used up', {
            code: 'prompt_runs_exhausted',
          });
    throw error;
  }
}

export async function settlePromptRun(db: Database, task: AuditTask, success: boolean, at: Date) {
  const subject = {
    kind: 'audit',
    id: task.id,
    workspaceId: task.workspace_id,
    auditId: task.audit_id,
  } as const;
  for (const capability of TASK_CAPABILITIES) {
    const holds = await holdsOf(db, subject, capability); // NOSONAR
    for (const reservationId of holds)
      await /* NOSONAR */ settle(db, {
        workspaceId: task.workspace_id,
        reservationId,
        spent: success ? Number.MAX_SAFE_INTEGER : 0,
        attempt: 1,
        dispatch: 'answer',
        at,
      });
  }
}
