import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, expect, it } from 'vitest';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { ensureWorkspaceBilling } from '../src/entitlements/bootstrap.ts';
import { reservePromptRuns, settlePromptRun } from '../src/audits/prompt-runs.ts';
import { cachedWorkspaceAccess, workspaceAccess } from '../src/entitlements/access.ts';
import { issueBundle, revokeBundle } from '../src/entitlements/grants.ts';
import type { AuditTask } from '../src/queue/audit-queue.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const accounts: string[] = [];

/** The trial starts at workspace creation; move this one's window eight days back. */
function ageTrial(accountId: string) {
  return db
    .updateTable('account_grants')
    .set({
      valid_from: sql`valid_from - interval '8 days'`,
      valid_until: sql`valid_until - interval '8 days'`,
    })
    .where('billing_account_id', '=', accountId)
    .where('source_kind', '=', 'trial')
    .execute();
}
it('distinguishes revoked authority from natural trial expiry', async () => {
  const t = await fixtures.tenant({ access: false });
  const user = await db
    .updateTable('users')
    .set({ registration_origin: 'public' })
    .where('id', '=', t.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
  await db.transaction().execute((trx) => ensureWorkspaceBilling(trx, t.workspaceId, user));
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', t.workspaceId)
    .executeTakeFirstOrThrow();
  accounts.push(account.id);
  await ageTrial(account.id);
  const grant = await db
    .selectFrom('account_grants')
    .selectAll()
    .where('billing_account_id', '=', account.id)
    .where('key', '=', 'workspace_access')
    .executeTakeFirstOrThrow();
  await db.transaction().execute((trx) =>
    revokeBundle(trx, {
      workspaceId: t.workspaceId,
      accountId: account.id,
      grantIds: [grant.id],
      key: randomUUID(),
      reason: 'Revoke fixture access before expiry',
      actorKind: 'operator',
      actorId: t.userId,
      at: new Date(grant.valid_from.getTime() + 86400000),
    }),
  );
  expect((await workspaceAccess(db, t.workspaceId)).status).toBe('access_unresolved');
});
it('lets a worker reuse a grant briefly, but a revocation lands within the TTL and a denial is never cached', async () => {
  const t = await fixtures.tenant();
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', t.workspaceId)
    .executeTakeFirstOrThrow();
  accounts.push(account.id);
  let clock = 0;
  const access = cachedWorkspaceAccess(db, 30_000, () => clock);
  await access(t.workspaceId);
  const grant = await db
    .selectFrom('account_grants')
    .selectAll()
    .where('billing_account_id', '=', account.id)
    .where('key', '=', 'workspace_access')
    .executeTakeFirstOrThrow();
  await db.transaction().execute((trx) =>
    revokeBundle(trx, {
      workspaceId: t.workspaceId,
      accountId: account.id,
      grantIds: [grant.id],
      key: randomUUID(),
      reason: 'Revoke mid-crawl',
      actorKind: 'operator',
      actorId: t.userId,
      at: new Date(),
    }),
  );
  clock = 29_000;
  await expect(access(t.workspaceId)).resolves.toBeDefined();
  clock = 31_000;
  await expect(access(t.workspaceId)).rejects.toMatchObject({ status: 403 });
  await expect(access(t.workspaceId)).rejects.toMatchObject({ status: 403 });
});
afterAll(async () => {
  if (accounts.length)
    await db.deleteFrom('consumable_ledger').where('billing_account_id', 'in', accounts).execute();
  await fixtures.cleanup();
  await db.destroy();
});

it('serializes the trial’s 20 prompt runs, returns failed runs and spends a success once', async () => {
  const t = await fixtures.tenant({ access: false });
  const user = await db
    .updateTable('users')
    .set({ registration_origin: 'public' })
    .where('id', '=', t.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
  await db.transaction().execute((trx) => ensureWorkspaceBilling(trx, t.workspaceId, user));
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', t.workspaceId)
    .executeTakeFirstOrThrow();
  accounts.push(account.id);
  const auditId = await fixtures.audit(t);
  const tasks: AuditTask[] = [];
  for (let index = 0; index < 25; index++) {
    const execution = await fixtures.execution(t, { auditId, analysis: null });
    tasks.push(
      await db
        .selectFrom('audit_tasks')
        .selectAll()
        .where('id', '=', execution.taskId)
        .executeTakeFirstOrThrow(),
    );
  }
  const reserveAll = (batch: AuditTask[]) =>
    db.transaction().execute((trx) =>
      reservePromptRuns(trx, {
        workspaceId: t.workspaceId,
        auditId,
        taskIds: batch.map((task) => task.id),
        at: new Date(),
      }),
    );
  const reserve = (task: AuditTask) => reserveAll([task]);
  const settle = (task: AuditTask, success: boolean) =>
    db.transaction().execute((trx) => settlePromptRun(trx, task, success, new Date()));
  const results = await Promise.allSettled(tasks.slice(0, 21).map(reserve));
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(20);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { status: 403, code: 'prompt_runs_exhausted' },
  });
  const held = tasks.slice(0, 21).filter((_, index) => results[index]!.status === 'fulfilled');
  // A failed answer returns its run, so one more can be held.
  await settle(held[0]!, false);
  await reserve(tasks[21]!);
  // A recorded answer spends its run, once however often it settles.
  await settle(held[1]!, true);
  await settle(held[1]!, true);
  // One audit's runs are held together: two free runs refuse three tasks outright.
  await settle(held[2]!, false);
  await settle(held[3]!, false);
  await expect(reserveAll(tasks.slice(22, 25))).rejects.toMatchObject({
    code: 'prompt_runs_exhausted',
  });
  expect((await reserveAll(tasks.slice(22, 24))).reservationIds).toHaveLength(2);
  await expect(reserve(tasks[24]!)).rejects.toMatchObject({ code: 'prompt_runs_exhausted' });
  const spent = await db
    .selectFrom('consumable_ledger')
    .select(({ fn }) => fn.sum<string>('units').as('units'))
    .where('billing_account_id', '=', account.id)
    .where('capability_key', '=', 'prompt_runs_per_period')
    .where('entry_kind', '=', 'debit')
    .executeTakeFirstOrThrow();
  expect(Number(spent.units)).toBe(1);
});

it('only explicit restoration reopens an expired workspace, preserving its data', async () => {
  const t = await fixtures.tenant({ access: false });
  const user = await db
    .updateTable('users')
    .set({ registration_origin: 'public' })
    .where('id', '=', t.userId)
    .returningAll()
    .executeTakeFirstOrThrow();
  await db.transaction().execute((trx) => ensureWorkspaceBilling(trx, t.workspaceId, user));
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', t.workspaceId)
    .executeTakeFirstOrThrow();
  accounts.push(account.id);
  await ageTrial(account.id);
  const grant = async (key: string) =>
    db.transaction().execute((trx) =>
      issueBundle(trx, {
        workspaceId: t.workspaceId,
        accountId: account.id,
        key: randomUUID(),
        sourceKind: 'override',
        sourceRef: 'test-operator',
        specs: [{ key, value: 1 }],
        revision: 'test',
        from: new Date(),
        until: null,
        primary: false,
        profile: '',
        priority: 0,
      }),
    );
  expect((await workspaceAccess(db, t.workspaceId)).status).toBe('trial_expired');
  await grant('project_slots');
  expect((await workspaceAccess(db, t.workspaceId)).status).toBe('trial_expired');
  await grant('workspace_access');
  expect((await workspaceAccess(db, t.workspaceId)).status).toBe('active');
  expect(
    await db.selectFrom('projects').select('id').where('id', '=', t.projectId).executeTakeFirst(),
  ).toBeDefined();
});
