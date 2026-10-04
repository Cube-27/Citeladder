/** Real composed one-shot bootstrap on an empty disposable Alembic database. */
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import pg from 'pg';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database.ts';
import { loadConfig } from '../src/config.ts';
import { initializeCatalog } from '../src/billing/admin.ts';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const python = join(
  root,
  'backend/.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const execute = promisify(execFile);
const name = `citeladder_bootstrap_test_${randomUUID().replaceAll('-', '')}`;
const base = new URL(process.env.API_TEST_DATABASE_URL!);
const adminUrl = new URL(base);
adminUrl.pathname = '/postgres';
const disposableUrl = new URL(base);
disposableUrl.pathname = `/${name}`;
const systemEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP)$/iu.test(key)),
);
const env = {
  ...systemEnv,
  CITELADDER_DISABLE_DOTENV: '1',
  APP_ENV: 'development',
  DATABASE_URL: disposableUrl.href.replace('postgresql:', 'postgresql+asyncpg:'),
  JWT_SECRET_KEY: 'fixture-independent-session-key-0123456789abcdef',
  ENCRYPTION_KEY: 'fixture-independent-encryption-key-0123456789abcdef',
  REFERRAL_HASH_SALT: 'fixture-independent-referral-salt-0123456789abcdef',
  DEV_LOGIN_EMAIL: 'bootstrap@example.test',
  DEV_LOGIN_PASSWORD: 'fixture-development-password',
  DEV_LOGIN_COUNTER_ALLOWANCE: '100',
  DB_SSL_MODE: 'disable',
  TRUSTED_PROXY_CIDRS: '',
  FRONTEND_URL: 'http://127.0.0.1:3000',
};
const db = createDatabase(loadConfig(env));
const connection = new pg.Client({ connectionString: adminUrl.href });
let created = false;
const native = (overrides: Record<string, string> = {}, args: string[] = []) =>
  execute(
    process.execPath,
    [join(root, 'frontend/services/api/src/cli/bootstrap-catalog.ts'), ...args],
    { cwd: root, env: { ...env, ...overrides }, timeout: 30000 },
  );
const identity = () =>
  execute(python, ['-m', 'app.demo.bootstrap'], {
    cwd: join(root, 'backend'),
    env,
    timeout: 30000,
  });
beforeAll(async () => {
  await connection.connect();
  await connection.query(`CREATE DATABASE "${name}"`);
  created = true;
  await execute(python, ['-m', 'alembic', 'upgrade', 'head'], {
    cwd: join(root, 'backend'),
    env,
    timeout: 60000,
  });
  await execute(python, ['-m', 'alembic', 'check'], {
    cwd: join(root, 'backend'),
    env,
    timeout: 60000,
  });
}, 120000);
afterAll(async () => {
  await db.destroy();
  if (created) await connection.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await connection.end();
});
it('preserves skip branches, fails before missing actors, then runs identity/catalog twice', async () => {
  await native({ DEV_LOGIN_PASSWORD: '' });
  await native({ DEMO_MODE: 'true' });
  expect(await db.selectFrom('billing_catalog_revisions').select('id').execute()).toEqual([]);
  await expect(native()).rejects.toThrow();
  await identity();
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', env.DEV_LOGIN_EMAIL)
    .executeTakeFirstOrThrow();
  expect(actor.role).toBe('admin');
  expect(await db.selectFrom('billing_catalog_revisions').select('id').execute()).toEqual([]);
  await native();
  const first = await db
    .selectFrom('billing_catalog_revisions')
    .selectAll()
    .executeTakeFirstOrThrow();
  expect(first.publication_state).toBe('published');
  expect(first.published_by_user_id).toBe(actor.id);
  await identity();
  await native();
  const rows = await db.selectFrom('billing_catalog_revisions').selectAll().execute();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.published_at).toEqual(first.published_at);
  await db.updateTable('users').set({ is_active: false }).where('id', '=', actor.id).execute();
  await expect(initializeCatalog(db, actor.email, null)).rejects.toThrow('administrator');
  await identity();
}, 90000);
it('leaves the committed identity after catalog failure and allows a reviewed retry', async () => {
  await db.deleteFrom('billing_catalog_revisions').execute();
  await identity();
  const actor = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow();
  const bad = await db
    .insertInto('billing_catalog_revisions')
    .values({
      id: randomUUID(),
      revision: 'launch-pricing-v1',
      payload: '{}',
      payload_sha256: 'f'.repeat(64),
      publication_state: 'draft',
      created_by_user_id: actor.id,
      created_reason: 'invalid fixture',
      created_at: new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await expect(native()).rejects.toThrow();
  expect((await db.selectFrom('users').select('id').executeTakeFirstOrThrow()).id).toBe(actor.id);
  expect(
    (
      await db
        .selectFrom('billing_catalog_revisions')
        .select('publication_state')
        .where('id', '=', bad.id)
        .executeTakeFirstOrThrow()
    ).publication_state,
  ).toBe('draft');
  // Disposable fixture repair only; production correction stays forward-publication.
  await db.deleteFrom('billing_catalog_revisions').where('id', '=', bad.id).execute();
  await native();
  expect(
    (
      await db
        .selectFrom('billing_catalog_revisions')
        .select('publication_state')
        .executeTakeFirstOrThrow()
    ).publication_state,
  ).toBe('published');
}, 60000);
