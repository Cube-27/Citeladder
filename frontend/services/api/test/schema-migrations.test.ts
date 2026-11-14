/** The migrate CLI's admission against real PostgreSQL: numbered forward migrations, each applied once. */
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

async function columnType(client: pg.Client, table: string, column: string) {
  const result = await client.query<{ data_type: string }>(
    "select data_type from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2",
    [table, column],
  );
  return result.rows[0]?.data_type;
}

/** The services' URL for a fresh database: the application role the suite already connects as. */
const appUrl = (ownerUrl: string) =>
  Object.assign(new URL(process.env.API_TEST_DATABASE_URL!), {
    pathname: new URL(ownerUrl).pathname,
  }).href;

/** The deployed migrate job: the schema owner's URL plus the services' URL. */
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

/** The migration files as the repository holds them, so adding one needs no edit here. */
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

    // Numbered 0001, 0002, … with no gap or duplicate.
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
    const pendingAfterBaseline = await applyMigrations(client);
    expect(pendingAfterBaseline[0]).toBe('0002_agent_single_draft');
    expect(pendingAfterBaseline).toEqual(directory.slice(1));
    // A URL identity keeps no per-sighting discovery status.
    expect(await columns(client, 'site_urls')).not.toContain('discovery_status');
    expect(await columns(client, 'site_urls')).toContain('latest_title');
    // The Site Health runtime keeps no validity copy of the grants it projects.
    expect(await columns(client, 'workspace_site_health_runtime')).not.toContain(
      'resolved_valid_until',
    );
    expect(await columns(client, 'workspace_site_health_runtime')).toContain('workspace_id');
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
        // Each call's internal cost.
        'cost_microusd',
      ]),
    );
    // A content-angle run keeps the three input keys it is recomputed on.
    expect(await columns(client, 'content_angle_runs')).toEqual(
      expect.arrayContaining(['cluster_key', 'match_key', 'aggregate_key', 'outcome']),
    );
    // A page document keeps the snapshot it started from and its SEO fields.
    expect(await columns(client, 'agent_outputs')).toContain('snapshot_id');
    expect(await columns(client, 'agent_output_revisions')).toContain('fields');
    // A page document's suggestions are insert-only; their status changes are events.
    expect(await columns(client, 'agent_output_suggestion_events')).toEqual(
      expect.arrayContaining(['suggestion_id', 'sequence', 'status', 'revision_id', 'reason']),
    );
    // Each suggestion keeps the source and strength its rule had when it was made.
    expect(await columns(client, 'agent_output_suggestions')).toContain('rule_guidance');
    // One Actions list: an Action names no screen of its own.
    expect(await columns(client, 'actions')).not.toContain('surface');
    // An Action keeps its last member set; a declaration may have no baseline
    // snapshot and names the refresh that resolved its findings before go-live.
    expect(await columns(client, 'actions')).toContain('last_member_opportunity_ids');
    expect(await columns(client, 'opportunity_implementation_events')).toContain(
      'resolved_before_snapshot_id',
    );
    // An issue catalog keeps one reference snippet per issue family.
    expect(await columns(client, 'site_issue_catalogs')).toContain('reference_snippets');
    // An issue-family Action keeps the cohort it was grouped from.
    expect(await columns(client, 'actions')).toContain('cohort');
    // A project's crawl schedule is claimed under a lease.
    expect(await columns(client, 'crawl_schedules')).toEqual(
      expect.arrayContaining(['cadence', 'next_run_at', 'lease_owner', 'failure_count']),
    );
    // Catalog categories nest; imports stage their category tree before applying.
    expect(await columns(client, 'commerce_categories')).toContain('parent_category_id');
    expect(await columns(client, 'commerce_products')).toEqual(
      expect.arrayContaining(['image_url', 'price_max']),
    );
    expect(await columns(client, 'commerce_csv_imports')).toEqual(
      expect.arrayContaining(['source_format', 'source_ref', 'excluded_categories', 'applied_at']),
    );
    // One internal-cost view across platform calls, Agent calls and answer engines.
    expect(await columns(client, 'internal_costs')).toEqual(
      expect.arrayContaining(['source', 'workspace_id', 'charge', 'cost_microusd', 'occurred_at']),
    );
    expect(await ledger(client)).toEqual(directory);
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
    const alter = {
      version: '0002_alter',
      sql: 'ALTER TABLE public.workspaces ADD COLUMN probe integer;',
    };

    // The serving revision reads the table inside an open transaction.
    await serving.query('begin');
    await serving.query('select * from public.workspaces');
    await expect(applyMigrations(migrate, [baseline!, alter])).rejects.toThrow(
      'canceling statement due to lock timeout',
    );
    await serving.query('rollback');
    expect(await columns(serving, 'workspaces')).not.toContain('probe');

    // A file that needs longer raises its own bound; the next file is bounded again.
    const raised = {
      version: '0003_raised',
      sql: "SET LOCAL statement_timeout = '10s';\nSELECT pg_sleep(1.5)",
    };
    const slow = { version: '0004_slow', sql: 'SELECT pg_sleep(1.5);' };
    await expect(applyMigrations(migrate, [baseline!, alter, raised, slow])).rejects.toThrow(
      'canceling statement due to statement timeout',
    );
    expect(await ledger(serving)).toEqual(['0001_baseline']);
    expect(await columns(serving, 'workspaces')).not.toContain('probe');

    // With the lock free, the same migrations apply.
    expect(await applyMigrations(migrate, [baseline!, alter, raised])).toEqual([
      '0002_alter',
      '0003_raised',
    ]);
    expect(await columns(serving, 'workspaces')).toContain('probe');
  }, 60000);
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

describe('shelf observations recorded before match passes', () => {
  it('each answer gets one live pass its observations reference, and answers become untargetable', async () => {
    const { client } = await freshDatabase();
    clients.push(client);
    const before = migrations.findIndex((file) => file.version === '0023_commerce_match_passes');
    await applyMigrations(client, migrations.slice(0, before));
    const [workspace, project, audit, task, artifact, target] = Array.from({ length: 6 }, () =>
      randomUUID(),
    );
    // Only the observation rows matter here; the referenced rows are not built.
    await client.query('SET session_replication_role = replica');
    const observe = (id: string) =>
      client.query(
        `insert into public.commerce_recommendation_observations (id, workspace_id, project_id, audit_id, task_id, artifact_id, target_kind, target_id, observed_product, observed_brand, classification, observed_title, observed_currency, merchant_url, merchant_domain, surface_kind, order_observable, match_confidence, parser_version, matcher_version, model_version, created_at)
         values ($1, $2, $3, $4, $5, $6, 'category', $7, 'Shoe', 'Acme', 'owned', 'Shoe', '', '', '', 'recommendation', false, 1, 'p1', 'm1', '', now())`,
        [id, workspace, project, audit, task, artifact, target],
      );
    await observe(randomUUID());
    await observe(randomUUID());

    expect(await applyMigrations(client, migrations.slice(0, before + 1))).toEqual([
      '0023_commerce_match_passes',
    ]);
    const passes = await client.query(
      'select id, artifact_id, catalog_revision_id, target_kind, mode from public.commerce_match_passes',
    );
    expect(passes.rows).toEqual([
      {
        id: expect.any(String),
        artifact_id: artifact,
        catalog_revision_id: null,
        target_kind: 'category',
        mode: 'live',
      },
    ]);
    const linked = await client.query(
      'select distinct pass_id from public.commerce_recommendation_observations',
    );
    expect(linked.rows).toEqual([{ pass_id: passes.rows[0].id }]);
    // An answer no buyer prompt targets keeps no target, but never half of one.
    await client.query(
      'update public.commerce_recommendation_observations set target_kind = null, target_id = null',
    );
    await expect(
      client.query(
        "update public.commerce_recommendation_observations set target_kind = 'product'",
      ),
    ).rejects.toThrow(/ck_commerce_observation_target/u);
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
      stdout: expect.stringContaining('Schema migrations applied: 0001_baseline,'),
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
