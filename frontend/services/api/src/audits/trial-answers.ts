import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import type { AuditTask } from '../queue/audit-queue.ts';
import { reserveUsage, debitUsage, releaseUsage, LedgerError } from '../entitlements/ledger.ts';
import { lockAccount } from '../entitlements/grants.ts';
import { ApiError } from '../errors.ts';
import { workspaceAccess } from '../entitlements/access.ts';
import { policy } from '../config.ts';

/** The immutable task snapshot retains prompt identity after prompt deletion. */
export async function reserveTrialAnswer(
  db: Database,
  workspaceId: string,
  auditId: string,
  taskId: string,
  promptId: string,
  at: Date,
) {
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
  if (account.registration_origin !== 'public') return;
  await lockAccount(db, workspaceId, account.id);
  if ((await workspaceAccess(db, workspaceId, at)).status !== 'trial_active') return;
  const used = await db
    .selectFrom('consumable_ledger as l')
    .innerJoin('audit_tasks as t', 't.id', 'l.task_id')
    .select(
      sql<number>`coalesce(sum(case when l.entry_kind in ('reservation', 'debit') then l.units when l.entry_kind = 'release' then -l.units else 0 end), 0)::int`.as(
        'units',
      ),
    )
    .where('l.billing_account_id', '=', account.id)
    .where('l.capability_key', '=', 'successful_answers')
    .where(sql<string>`t.request_snapshot ->> 'original_prompt_id'`, '=', promptId)
    .executeTakeFirstOrThrow();
  if (used.units >= policy.entitlements.public_trial.successful_answers_per_prompt)
    throw new ApiError(403, 'This prompt has used its trial answer');
  try {
    await reserveUsage(db, {
      accountId: account.id,
      capability: 'successful_answers',
      units: 1,
      subject: { kind: 'audit', id: taskId, workspaceId, auditId },
      key: `trial-answer:${taskId}`,
      at,
    });
  } catch (error) {
    if (error instanceof LedgerError && error.message === 'funded_credits_exhausted')
      throw new ApiError(403, 'The trial answer allowance is exhausted', {
        code: 'capability_not_granted',
      });
    throw error;
  }
}

export async function settleTrialAnswer(db: Database, task: AuditTask, success: boolean, at: Date) {
  const holds = await db
    .selectFrom('consumable_ledger')
    .select(['billing_account_id', 'reservation_id'])
    .distinct()
    .where('workspace_id', '=', task.workspace_id)
    .where('task_id', '=', task.id)
    .where('capability_key', '=', 'successful_answers')
    .where('entry_kind', '=', 'reservation')
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
        key: `trial-answer:${task.id}:success`,
        dispatchKey: 'success',
      });
    await releaseUsage(db, { ...request, key: `trial-answer:${task.id}:release` });
  }
}
