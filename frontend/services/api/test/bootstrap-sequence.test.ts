/** Native account/catalog composition on an empty disposable Alembic database. */
import { beforeEach, expect, it } from 'vitest';
import { join } from 'node:path';
import { disposableDatabase } from './disposable-database.ts';
import { bootstrapDeployment } from '../src/auth/deployment-bootstrap.ts';
import { initializeCatalog } from '../src/billing/admin.ts';
import { verifyPassword } from '../src/auth/password.ts';
import { productionEnv } from './production-config.ts';
const { db, env, root, execute } = disposableDatabase();
const native = (overrides: Record<string, string> = {}, args: string[] = []) =>
  execute(
    process.execPath,
    [join(root, 'frontend/services/api/src/cli/bootstrap-account.ts'), ...args],
    { cwd: root, env: { ...env, ...overrides }, timeout: 60000 },
  );
beforeEach(async () => {
  await db.deleteFrom('billing_catalog_revisions').execute();
  await db.deleteFrom('workspaces').execute();
  await db.deleteFrom('users').execute();
});
it('preserves an unconfigured local skip and composes repeated/concurrent identity and catalog startup', async () => {
  await native({ DEV_LOGIN_PASSWORD: '' });
  expect(await db.selectFrom('users').select('id').execute()).toEqual([]);
  await Promise.all([native(), native()]);
  const user = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow();
  const catalog = await db
    .selectFrom('billing_catalog_revisions')
    .selectAll()
    .executeTakeFirstOrThrow();
  expect(user.role).toBe('admin');
  expect(await verifyPassword(env.DEV_LOGIN_PASSWORD, user.hashed_password)).toBe(true);
  expect(catalog).toMatchObject({ publication_state: 'published', published_by_user_id: user.id });
  const grants = await db.selectFrom('account_grants').selectAll().execute();
  await native();
  expect(await db.selectFrom('account_grants').selectAll().execute()).toEqual(grants);
  expect(
    (await db.selectFrom('users').select('session_version').executeTakeFirstOrThrow())
      .session_version,
  ).toBe(user.session_version);
  await native({ DEV_LOGIN_PASSWORD: 'changed-fixture-password' });
  const rotated = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow();
  expect(rotated.session_version).toBe(user.session_version + 1);
  expect(await verifyPassword('changed-fixture-password', rotated.hashed_password)).toBe(true);
  expect(await db.selectFrom('billing_catalog_revisions').select('id').execute()).toEqual([
    { id: catalog.id },
  ]);
}, 120000);
it('commits identity before a catalog failure, refuses unauthorized publication, then retries idempotently', async () => {
  await expect(
    bootstrapDeployment(db, env, async () => {
      throw new Error('catalog fixture failure');
    }),
  ).rejects.toThrow('catalog fixture failure');
  const user = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow();
  await db.updateTable('users').set({ is_active: false }).where('id', '=', user.id).execute();
  await expect(initializeCatalog(db, user.email, null)).rejects.toThrow('administrator');
  await native();
  expect((await db.selectFrom('users').select('id').executeTakeFirstOrThrow()).id).toBe(user.id);
  expect(
    (
      await db
        .selectFrom('billing_catalog_revisions')
        .select('publication_state')
        .executeTakeFirstOrThrow()
    ).publication_state,
  ).toBe('published');
}, 60000);
it('demo startup grants only expiring monitored URLs, rotates sessions and refuses an unexpected identity', async () => {
  const demo = {
    ...env,
    ...productionEnv,
    DEMO_MODE: 'true',
    DEMO_EXPIRES_AT: '2099-01-01T00:00:00Z',
    DEMO_MONITORED_URL_LIMIT: '50',
  };
  await expect(
    bootstrapDeployment(db, { ...demo, APP_ENV: 'development', JWT_SECRET_KEY: 'weak' }),
  ).rejects.toThrow('strength policy');
  await expect(bootstrapDeployment(db, { ...demo, DEMO_EXPIRES_AT: '' })).rejects.toThrow();
  await Promise.all([bootstrapDeployment(db, demo), bootstrapDeployment(db, demo)]);
  const user = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow();
  expect(user.session_version).toBe(1);
  const grants = await db
    .selectFrom('account_grants')
    .select(['key', 'value', 'valid_until'])
    .execute();
  expect(grants).toEqual([
    { key: 'monitored_urls', value: 50, valid_until: new Date(demo.DEMO_EXPIRES_AT) },
  ]);
  expect(await db.selectFrom('billing_catalog_revisions').select('id').execute()).toEqual([]);
  await db
    .updateTable('users')
    .set({ email: 'unexpected@example.test' })
    .where('id', '=', user.id)
    .execute();
  await expect(bootstrapDeployment(db, demo)).rejects.toThrow('unexpected_demo_identity');
  expect(
    await db.selectFrom('account_grants').select(['key', 'value', 'valid_until']).execute(),
  ).toEqual(grants);
}, 60000);
