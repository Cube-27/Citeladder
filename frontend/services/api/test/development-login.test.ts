import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { Fixtures, testConfig, testDatabase } from './support.ts';
import { provisionDevelopmentLogin } from '../src/auth/bootstrap.ts';
import { authenticateUser, registerUser } from '../src/auth/service.ts';
import { hashPassword } from '../src/auth/password.ts';

const config = testConfig(),
  db = testDatabase(config),
  fixtures = new Fixtures(db);
const created: { user_id: string; workspace_id: string }[] = [];
afterAll(async () => {
  for (const scope of created) {
    await db.deleteFrom('workspaces').where('id', '=', scope.workspace_id).execute();
    await db.deleteFrom('users').where('id', '=', scope.user_id).execute();
  }
  await fixtures.cleanup();
  await db.destroy();
});
it('refuses nonlocal/production targets and invalid input before writing', async () => {
  const input = {
    email: `${randomUUID()}@example.test`,
    password: 'fixture-password',
    allowance: 100,
  };
  await expect(
    provisionDevelopmentLogin(db, { ...config, appEnv: 'production' }, input),
  ).rejects.toThrow('local_development_required');
  await expect(
    provisionDevelopmentLogin(
      db,
      { ...config, databaseUrl: 'postgresql://u:p@shared.example/db' },
      input,
    ),
  ).rejects.toThrow('local_development_required');
  await expect(provisionDevelopmentLogin(db, config, { ...input, allowance: 0 })).rejects.toThrow();
  await expect(
    provisionDevelopmentLogin(db, config, { ...input, password: 'short' }),
  ).rejects.toThrow();
});
it('provisions/authenticates once, refuses wrong credentials and tops up without duplicating grants', async () => {
  const input = {
    email: `${randomUUID()}@example.test`,
    password: 'fixture-password',
    allowance: 100,
  };
  const first = await provisionDevelopmentLogin(db, config, input);
  created.push(first);
  const grants = () =>
    db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .selectAll('account_grants')
      .where('billing_accounts.workspace_id', '=', first.workspace_id)
      .execute();
  const original = await grants();
  expect(await provisionDevelopmentLogin(db, config, input)).toEqual(first);
  expect((await grants()).length).toBe(original.length);
  await expect(
    provisionDevelopmentLogin(db, config, { ...input, password: 'other-password' }),
  ).rejects.toThrow('unexpected_development_identity');
  expect((await authenticateUser(db, input.email, input.password))?.id).toBe(first.user_id);
  await provisionDevelopmentLogin(db, config, { ...input, allowance: 150 });
  expect(
    (await grants())
      .filter((g) => g.key === 'monitored_urls' && g.idempotency_key.startsWith('dev-full-access:'))
      .reduce((sum, g) => sum + g.value, 0),
  ).toBe(150);
});
it('refuses existing ordinary/inactive identities; public signup only receives the free baseline', async () => {
  const user = await fixtures.user();
  const row = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', user)
    .executeTakeFirstOrThrow();
  await db
    .updateTable('users')
    .set({ hashed_password: await hashPassword('fixture-password') })
    .where('id', '=', user)
    .execute();
  await expect(
    provisionDevelopmentLogin(db, config, {
      email: row.email,
      password: 'fixture-password',
      allowance: 100,
    }),
  ).rejects.toThrow('unexpected_development_identity');
  await db
    .updateTable('users')
    .set({ role: 'admin', is_active: false })
    .where('id', '=', user)
    .execute();
  await expect(
    provisionDevelopmentLogin(db, config, {
      email: row.email,
      password: 'fixture-password',
      allowance: 100,
    }),
  ).rejects.toThrow('unexpected_development_identity');
  const email = `${randomUUID()}@example.test`;
  await registerUser(db, email, 'fixture-password');
  const registered = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirstOrThrow();
  const ws = await db
    .selectFrom('workspace_members')
    .select('workspace_id')
    .where('user_id', '=', registered.id)
    .executeTakeFirstOrThrow();
  created.push({ user_id: registered.id, workspace_id: ws.workspace_id });
  expect(
    await db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .select('account_grants.source_ref')
      .where('billing_accounts.workspace_id', '=', ws.workspace_id)
      .execute(),
  ).toEqual(expect.arrayContaining([{ source_ref: 'system:public-signup' }]));
  expect(
    await db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .select('account_grants.id')
      .where('billing_accounts.workspace_id', '=', ws.workspace_id)
      .where('account_grants.source_ref', '!=', 'system:public-signup')
      .execute(),
  ).toEqual([]);
});
