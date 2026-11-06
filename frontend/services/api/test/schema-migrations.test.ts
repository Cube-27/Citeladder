/** The migrate CLI's admission against real PostgreSQL: numbered forward migrations, each applied once. */
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations, readMigrations } from '../src/cli/schema-migrations.ts';

const base = new URL(process.env.API_TEST_DATABASE_URL!);
const admin = new pg.Client({
  connectionString: Object.assign(new URL(base), { pathname: '/postgres' }).href,
});
const created: string[] = [];
const migrations = readMigrations();
const [baseline] = migrations;

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
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function columnType(client: pg.Client, table: string, column: string) {
  const result = await client.query<{ data_type: string }>(
    "select data_type from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2",
    [table, column],
  );
  return result.rows[0]?.data_type;
}

const ledger = async (client: pg.Client) =>
  (await client.query('select version from public.schema_migrations order by version')).rows;

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

    expect(await applyMigrations(client)).toEqual([
      '0001_baseline',
      '0002_agent_single_draft',
      '0003_agent_cache_replay',
      '0004_agent_documents_web_search',
      '0005_agent_call_hold_basis',
      '0006_capacity_and_queue_indexes',
      '0007_workspace_tenancy_keys',
      '0008_commerce_resolver_outcome',
      '0009_perception_model_omitted',
      '0010_differentiation_reports_insert_only',
    ]);
    expect(await publicTables(client)).toEqual(
      expect.arrayContaining(['schema_migrations', 'workspaces']),
    );
    expect(await ledger(client)).toEqual([
      { version: '0001_baseline' },
      { version: '0002_agent_single_draft' },
      { version: '0003_agent_cache_replay' },
      { version: '0004_agent_documents_web_search' },
      { version: '0005_agent_call_hold_basis' },
      { version: '0006_capacity_and_queue_indexes' },
      { version: '0007_workspace_tenancy_keys' },
      { version: '0008_commerce_resolver_outcome' },
      { version: '0009_perception_model_omitted' },
      { version: '0010_differentiation_reports_insert_only' },
    ]);

    // A CRLF checkout is the same file.
    const crlf = migrations.map((file) => ({ ...file, sql: file.sql.replaceAll('\n', '\r\n') }));
    expect(await applyMigrations(client, crlf)).toEqual([]);
    const edited = migrations.map((file, index) =>
      index === 0
        ? { ...file, sql: `${file.sql}\nCREATE TABLE public.extra (id integer);\n` }
        : file,
    );
    await expect(applyMigrations(client, edited)).rejects.toThrow(
      /Migration 0001_baseline changed after this database applied it.*new numbered migration/u,
    );
    expect(await publicTables(client)).not.toContain('extra');
    // A release without a version the database recorded is refused, not rolled back.
    await expect(applyMigrations(client, migrations.slice(0, 2))).rejects.toThrow(
      'This database recorded migration 0003_agent_cache_replay, which this release does not contain.',
    );
  }, 120000);
});

describe('an existing database', () => {
  it('takes only the pending migrations, in place', async () => {
    const { client } = await freshDatabase();
    clients.push(client);

    expect(await applyMigrations(client, [baseline!])).toEqual(['0001_baseline']);
    expect(await columns(client, 'agent_runs')).toContain('mode');
    expect(await columnType(client, 'agent_run_transcripts', 'messages')).toBe('jsonb');
    expect(await applyMigrations(client)).toEqual([
      '0002_agent_single_draft',
      '0003_agent_cache_replay',
      '0004_agent_documents_web_search',
      '0005_agent_call_hold_basis',
      '0006_capacity_and_queue_indexes',
      '0007_workspace_tenancy_keys',
      '0008_commerce_resolver_outcome',
      '0009_perception_model_omitted',
      '0010_differentiation_reports_insert_only',
    ]);
    // Project-owned rows name their workspace.
    for (const table of ['brands', 'competitors', 'prompt_sets', 'prompts', 'topics'])
      expect(await columns(client, table)).toContain('workspace_id');
    // Each shelf observation records its resolver outcome; omitted entities and claims are flagged.
    expect(await columns(client, 'commerce_recommendation_observations')).toEqual(
      expect.arrayContaining(['resolver_outcome', 'resolver_template_version']),
    );
    expect(await columns(client, 'entity_sentiments')).toContain('model_omitted');
    expect(await columns(client, 'claim_verdicts')).toContain('model_omitted');
    // Differentiation reports are insert-only: a task keeps every report version.
    const reportIndexes = await client.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'content_differentiation_reports' and indexname like '%task%' order by indexname",
    );
    expect(reportIndexes.rows.map((row) => row.indexname)).toEqual([
      'ix_content_diff_report_task_latest',
    ]);
    expect(await columns(client, 'agent_runs')).not.toContain('mode');
    expect(await columns(client, 'agent_output_revisions')).not.toContain('approved_at');
    // Transcripts keep their bytes; each model call records its cache use.
    expect(await columnType(client, 'agent_run_transcripts', 'messages')).toBe('json');
    expect(await columns(client, 'agent_model_attempts')).toEqual(
      expect.arrayContaining([
        'response_id',
        'cache_miss_reason',
        'usage_iterations',
        // What each call's credit hold was sized from.
        'input_bytes',
        'max_output_tokens',
      ]),
    );
    expect(await ledger(client)).toEqual([
      { version: '0001_baseline' },
      { version: '0002_agent_single_draft' },
      { version: '0003_agent_cache_replay' },
      { version: '0004_agent_documents_web_search' },
      { version: '0005_agent_call_hold_basis' },
      { version: '0006_capacity_and_queue_indexes' },
      { version: '0007_workspace_tenancy_keys' },
      { version: '0008_commerce_resolver_outcome' },
      { version: '0009_perception_model_omitted' },
      { version: '0010_differentiation_reports_insert_only' },
    ]);
  }, 120000);
});

describe('a chat with a document before multi-document chats', () => {
  it('keeps the document as Document 1 and then numbers a chat’s documents uniquely', async () => {
    const { client } = await freshDatabase();
    clients.push(client);
    await applyMigrations(client, migrations.slice(0, 3));
    const [workspace, project, chat, first, second, third] = Array.from({ length: 6 }, () =>
      randomUUID(),
    );
    // Only the document rows matter here; the referenced rows are not built.
    await client.query('SET session_replication_role = replica');
    const insert = (id: string, number?: number) =>
      client.query(
        `insert into public.agent_outputs (id, chat_id, kind, skill_id, created_at, updated_at, workspace_id, project_id${
          number ? ', number' : ''
        }) values ($1, $2, 'page_rewrite', 'content_writer', now(), now(), $3, $4${number ? ', $5' : ''})`,
        number ? [id, chat, workspace, project, number] : [id, chat, workspace, project],
      );
    await insert(first!);

    expect(await applyMigrations(client, migrations.slice(0, 4))).toEqual([
      '0004_agent_documents_web_search',
    ]);
    const kept = await client.query('select id, number from public.agent_outputs');
    expect(kept.rows).toEqual([{ id: first, number: 1 }]);
    await insert(second!, 2);
    await expect(insert(third!, 2)).rejects.toThrow(/uq_agent_output_chat_number/u);
    expect(await columns(client, 'agent_messages')).toContain('web_sources');
    expect(await columns(client, 'agent_model_attempts')).toContain('web_search_requests');
  }, 120000);
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

    // Admission reads only emptiness, so a short failing script proves the rollback.
    const broken = {
      version: '0001_broken',
      sql: 'CREATE TABLE public.partial (id integer);\nSELECT 1 / 0;\n',
    };
    await expect(applyMigrations(client, [broken])).rejects.toThrow('division by zero');
    expect(await publicTables(client)).toEqual([]);
  }, 120000);

  it('fails the migrate job with the reason', async () => {
    const { client, url } = await freshDatabase();
    // Any schema the ledger did not record, such as a database from before the ledger existed.
    await client.query('CREATE TABLE public.unrecorded_table (id integer PRIMARY KEY)');
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
        'no schema_migrations ledger, so migrations were not applied over them.',
      ),
    });
  }, 90000);
});
