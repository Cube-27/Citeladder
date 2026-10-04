/** Fresh Alembic schema for bootstrap/seed tests. Never reset a supplied database. */
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import pg from 'pg';
import { beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../src/db/database.ts';
import { loadConfig } from '../src/config.ts';

export function disposableDatabase() {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const python = join(
    root,
    'backend/.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  const name = `citeladder_bootstrap_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.API_TEST_DATABASE_URL!);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  url.pathname = `/${name}`;
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP)$/iu.test(key),
      ),
    ),
    CITELADDER_DISABLE_DOTENV: '1',
    APP_ENV: 'development',
    DATABASE_URL: url.href,
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
  const connection = new pg.Client({ connectionString: admin.href });
  const execute = promisify(execFile);
  let created = false;
  beforeAll(async () => {
    await connection.connect();
    await connection.query(`CREATE DATABASE "${name}"`);
    created = true;
    for (const args of [['upgrade', 'head'], ['check']])
      await execute(python, ['-m', 'alembic', ...args], {
        cwd: join(root, 'backend'),
        env: { ...env, DATABASE_URL: url.href.replace('postgresql:', 'postgresql+asyncpg:') },
        timeout: 60000,
      });
  }, 120000);
  afterAll(async () => {
    await db.destroy();
    if (created) await connection.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await connection.end();
  });
  return { db, env, root, execute };
}
