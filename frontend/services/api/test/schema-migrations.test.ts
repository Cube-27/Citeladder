import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations, migrationClient, readMigrations } from '../src/cli/schema-migrations.ts';
import { ownerDatabaseUrl } from './support.ts';

const base = new URL(ownerDatabaseUrl());
const admin = new pg.Client({
  connectionString: Object.assign(new URL(base), { pathname: '/postgres' }).href,
});
const created: string[] = [];
const migrations = readMigrations();
const [baseline] = migrations;
const probe = {
  version: '0002_probe',
  sql: 'ALTER TABLE public.workspaces ADD COLUMN probe integer;',
};

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

async function columns(client: pg.Client, table: string) {
  const result = await client.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

const appUrl = (ownerUrl: string) =>
  Object.assign(new URL(process.env.API_TEST_DATABASE_URL!), {
    pathname: new URL(ownerUrl).pathname,
  }).href;

const migrateCli = (ownerUrl: string, servicesUrl: string) =>
  promisify(execFile)(
    process.execPath,
    [fileURLToPath(new URL('../src/cli/migrate.ts', import.meta.url))],
    {
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        MIGRATION_DATABASE_URL: ownerUrl,
        DATABASE_URL: servicesUrl,
      },
      timeout: 60000,
    },
  );

const ledger = async (client: pg.Client) =>
  (
    await client.query<{ version: string }>(
      'select version from public.schema_migrations order by version',
    )
  ).rows.map((row) => row.version);

const directory = readdirSync(fileURLToPath(new URL('../migrations/', import.meta.url)))
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => name.slice(0, -'.sql'.length));

const clients: pg.Client[] = [];
beforeAll(() => admin.connect());
afterAll(async () => {
  await Promise.all(clients.map((client) => client.end()));
  for (const name of created) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

describe('a fresh database', () => {
  it('applies every migration once, reruns as a no-op and refuses an edited applied file', async () => {
    const { client } = await freshDatabase();
    clients.push(client);

    expect(directory.map((version) => Number(version.slice(0, 4)))).toEqual(
      directory.map((_, index) => index + 1),
    );
    const applied = await applyMigrations(client);
    expect(applied[0]).toBe('0001_baseline');
    expect(applied).toEqual(directory);
    expect(await publicTables(client)).toEqual(
      expect.arrayContaining(['schema_migrations', 'workspaces']),
    );
    expect(await ledger(client)).toEqual(directory);

    const edited = migrations.map((file, index) =>
      index === 0
        ? { ...file, sql: `${file.sql}\nCREATE TABLE public.extra (id integer);\n` }
        : file,
    );
    await expect(applyMigrations(client, edited)).rejects.toThrow(
      /Migration 0001_baseline changed after this database applied it.*new numbered migration/u,
    );
    expect(await publicTables(client)).not.toContain('extra');
    expect(await applyMigrations(client, [...migrations, probe])).toEqual(['0002_probe']);
    await expect(applyMigrations(client, migrations)).rejects.toThrow(
      'This database recorded migration 0002_probe, which this release does not contain.',
    );
  }, 120000);
});

describe('an existing database', () => {
  it('refuses a database migrated by a chain this baseline replaced, before applying anything', async () => {
    const { client } = await freshDatabase();
    clients.push(client);
    const older = [
      {
        version: '0001_baseline',
        sql: 'CREATE TABLE public.schema_migrations (version varchar(64) PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz DEFAULT now() NOT NULL);',
      },
      { version: '0002_agent_single_draft', sql: 'CREATE TABLE public.older_table (id integer);' },
    ];
    expect(await applyMigrations(client, older)).toEqual([
      '0001_baseline',
      '0002_agent_single_draft',
    ]);

    await expect(applyMigrations(client)).rejects.toThrow(
      /Migration 0001_baseline changed after this database applied it/u,
    );
    expect(await publicTables(client)).toEqual(['older_table', 'schema_migrations']);
    expect(await ledger(client)).toEqual(['0001_baseline', '0002_agent_single_draft']);
  }, 120000);
});

describe('a migration the serving revision would wait behind', () => {
  it('fails on a held lock or a long statement instead of waiting, unless the file raises its own bound', async () => {
    const { client: serving, url } = await freshDatabase();
    clients.push(serving);
    const migrate = migrationClient(url, {
      MIGRATION_LOCK_TIMEOUT_MS: '200',
      MIGRATION_STATEMENT_TIMEOUT_MS: '1000',
    });
    await migrate.connect();
    clients.push(migrate);
    expect(await applyMigrations(migrate, [baseline!])).toEqual(['0001_baseline']);

    await serving.query('begin');
    await serving.query('select * from public.workspaces');
    await expect(applyMigrations(migrate, [baseline!, probe])).rejects.toThrow(
      'canceling statement due to lock timeout',
    );
    await serving.query('rollback');
    expect(await columns(serving, 'workspaces')).not.toContain('probe');

    const raised = {
      version: '0003_raised',
      sql: "SET LOCAL statement_timeout = '10s';\nSELECT pg_sleep(1.5)",
    };
    const slow = { version: '0004_slow', sql: 'SELECT pg_sleep(1.5);' };
    await expect(applyMigrations(migrate, [baseline!, probe, raised, slow])).rejects.toThrow(
      'canceling statement due to statement timeout',
    );
    expect(await ledger(serving)).toEqual(['0001_baseline']);
    expect(await columns(serving, 'workspaces')).not.toContain('probe');

    expect(await applyMigrations(migrate, [baseline!, probe, raised])).toEqual([
      '0002_probe',
      '0003_raised',
    ]);
    expect(await columns(serving, 'workspaces')).toContain('probe');
  }, 60000);
});

describe('a database the migrations must not touch', () => {
  it('refuses unledgered tables, and a failing migration leaves nothing behind', async () => {
    const { client } = await freshDatabase();
    clients.push(client);

    await client.query('CREATE TABLE public.users (id integer)');
    await expect(applyMigrations(client)).rejects.toThrow(
      /tables but no schema_migrations ledger.*reset_database/u,
    );
    expect(await publicTables(client)).toEqual(['users']);
    await client.query('DROP TABLE public.users');

    const broken = {
      version: '0001_broken',
      sql: 'CREATE TABLE public.partial (id integer);\nSELECT 1 / 0;\n',
    };
    await expect(applyMigrations(client, [broken])).rejects.toThrow('division by zero');
    expect(await publicTables(client)).toEqual([]);
  }, 120000);

  it('fails the migrate job with the reason', async () => {
    const { client, url } = await freshDatabase();
    await client.query('CREATE TABLE public.unrecorded_table (id integer PRIMARY KEY)');
    await client.end();
    await expect(migrateCli(url, appUrl(url))).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'no schema_migrations ledger, so migrations were not applied over them.',
      ),
    });
  }, 90000);
});

describe('the application role', () => {
  it('logs in with the services’ password after the migrate job, and reaches rows only', async () => {
    const { client, url } = await freshDatabase();
    await client.end();
    await expect(migrateCli(url, appUrl(url))).resolves.toMatchObject({
      stdout: expect.stringContaining(`Schema migrations applied: ${directory.join(', ')}.`),
    });

    const app = new pg.Client({ connectionString: appUrl(url) });
    await app.connect();
    clients.push(app);
    expect((await app.query('select current_user as role')).rows).toEqual([
      { role: 'citeladder_app' },
    ]);
    expect((await app.query('select count(*)::int as users from public.users')).rows).toEqual([
      { users: 0 },
    ]);
    await expect(app.query('create table public.app_owned (id integer)')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(app.query('select version from public.schema_migrations')).rejects.toMatchObject({
      code: '42501',
    });
  }, 120000);

  it('refuses a services URL that connects as any other role', async () => {
    const { client, url } = await freshDatabase();
    await client.end();
    await expect(migrateCli(url, url)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('DATABASE_URL must connect as the citeladder_app role.'),
    });
  }, 120000);
});
