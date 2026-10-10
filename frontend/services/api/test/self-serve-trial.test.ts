import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, expect, it } from 'vitest';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { ensureWorkspaceBilling } from '../src/entitlements/bootstrap.ts';
import { reserveTrialAnswer, settleTrialAnswer } from '../src/audits/trial-answers.ts';
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

it('serializes lifetime answer holds, releases failures and preserves per-prompt successful use', async () => {
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
  const tasks: { task: AuditTask; promptId: string }[] = [];
  for (let index = 0; index < 21; index++) {
    const promptId = randomUUID();
    const execution = await fixtures.execution(t, { auditId, analysis: null });
    const task = await db
      .updateTable('audit_tasks')
      .set({ request_snapshot: JSON.stringify({ original_prompt_id: promptId }) })
      .where('id', '=', execution.taskId)
      .returningAll()
      .executeTakeFirstOrThrow();
    tasks.push({ task, promptId });
  }
  const reserve = (entry: (typeof tasks)[number]) =>
    db
      .transaction()
      .execute((trx) =>
        reserveTrialAnswer(trx, t.workspaceId, auditId, entry.task.id, entry.promptId, new Date()),
      );
  const results = await Promise.allSettled(tasks.map(reserve));
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(20);
  const failed = tasks[results.findIndex((result) => result.status === 'rejected')]!;
  const held = tasks.filter((_, index) => results[index]!.status === 'fulfilled');
  await db.transaction().execute((trx) => settleTrialAnswer(trx, held[0]!.task, false, new Date()));
  await reserve(failed);
  await db.transaction().execute((trx) => settleTrialAnswer(trx, held[1]!.task, true, new Date()));
  await db.transaction().execute((trx) => settleTrialAnswer(trx, held[1]!.task, true, new Date()));
  const replacement = await fixtures.execution(t, { auditId, analysis: null });
  await expect(
    db
      .transaction()
      .execute((trx) =>
        reserveTrialAnswer(
          trx,
          t.workspaceId,
          auditId,
          replacement.taskId,
          held[1]!.promptId,
          new Date(),
        ),
      ),
  ).rejects.toMatchObject({ status: 403 });
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
