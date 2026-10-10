/** The migrate CLI's admission against real PostgreSQL: one baseline, applied once. */
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyBaseline, readBaseline } from '../src/cli/schema-baseline.ts';

const base = new URL(process.env.API_TEST_DATABASE_URL!);
const admin = new pg.Client({
  connectionString: Object.assign(new URL(base), { pathname: '/postgres' }).href,
});
const created: string[] = [];
const baseline = readBaseline();

async function freshDatabase() {
  const name = `citeladder_baseline_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  created.push(name);
  const url = Object.assign(new URL(base), { pathname: `/${name}` }).href;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return { client, url };
}

async function publicTables(client: pg.Client) {
  const result = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  return result.rows.map((row) => row.tablename);
}

const clients: pg.Client[] = [];
beforeAll(() => admin.connect());
afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  for (const name of created) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

describe('a fresh database', () => {
  it('migrates once, reruns as a no-op and refuses a changed baseline', async () => {
    const { client } = await freshDatabase();
    clients.push(client);

    expect(await applyBaseline(client)).toBe('applied');
    expect(await publicTables(client)).toEqual(
      expect.arrayContaining(['schema_migrations', 'workspaces']),
    );
    const ledger = await client.query('select version, checksum from public.schema_migrations');
    expect(ledger.rows).toEqual([
      { version: '0001_baseline', checksum: expect.stringMatching(/^[0-9a-f]{64}$/u) },
    ]);

    // A CRLF checkout is the same baseline.
    expect(await applyBaseline(client, baseline.replaceAll('\n', '\r\n'))).toBe('current');
    await expect(
      applyBaseline(client, `${baseline}\nCREATE TABLE public.extra (id integer);\n`),
    ).rejects.toThrow(/baseline changed after this database was migrated.*reset_database/u);
    expect(await publicTables(client)).not.toContain('extra');
    expect(
      (await client.query('select count(*)::int as n from public.schema_migrations')).rows,
    ).toEqual([{ n: 1 }]);
  }, 120000);
});

describe('a database the baseline must not touch', () => {
  it('refuses unledgered tables, and a failing baseline leaves nothing behind', async () => {
    const { client } = await freshDatabase();
    clients.push(client);

    await client.query('CREATE TABLE public.users (id integer)');
    await expect(applyBaseline(client)).rejects.toThrow(
      /tables but no schema_migrations ledger.*reset_database/u,
    );
    expect(await publicTables(client)).toEqual(['users']);
    await client.query('DROP TABLE public.users');

    // Admission reads only emptiness, so a short failing script proves the rollback.
    const broken = 'CREATE TABLE public.partial (id integer);\nSELECT 1 / 0;\n';
    await expect(applyBaseline(client, broken)).rejects.toThrow('division by zero');
    expect(await publicTables(client)).toEqual([]);
  }, 120000);

  it('fails the migrate job with the reset instruction', async () => {
    const { client, url } = await freshDatabase();
    // Any schema the ledger did not record, such as a pre-retirement Alembic database.
    await client.query('CREATE TABLE public.alembic_version (version_num varchar(32) PRIMARY KEY)');
    await client.end();
    const run = promisify(execFile)(
      process.execPath,
      [fileURLToPath(new URL('../src/cli/migrate.ts', import.meta.url))],
      {
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, DATABASE_URL: url },
        timeout: 60000,
      },
    );
    await expect(run).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'no schema_migrations ledger, so the baseline was not applied over them. Redeploy with reset_database',
      ),
    });
  }, 90000);
});
