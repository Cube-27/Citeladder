import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { billingAccount, grant } from './prompt-fixtures.ts';
import { asOwner, Fixtures, testDatabase } from './support.ts';

const db = testDatabase();
const fixtures = new Fixtures(db);
afterEach(() => fixtures.cleanup());
afterAll(() => db.destroy());

const APPEND_ONLY = [
  'account_grants',
  'agent_proposal_outcomes',
  'agent_tool_attempts',
  'aio_observations',
  'answer_ad_observations',
  'answer_untracked_names',
  'billing_catalog_imports',
  'billing_payments',
  'brand_research_snapshots',
  'claim_verdict_overrides',
  'commerce_competitor_attempts',
  'commerce_product_observations',
  'commerce_recommendation_observations',
  'consumable_ledger',
  'grant_revocations',
  'integration_import_artifacts',
  'page_snapshots',
  'provider_attempts',
  'raw_response_artifacts',
  'robots_snapshots',
  'search_intelligence_dispatch_attempts',
  'site_change_observations',
  'site_fetch_artifacts',
  'site_fetch_attempts',
  'source_page_snapshots',
];

async function outcome(
  statement: 'update' | 'delete',
  table: string,
  column = 'id',
): Promise<string> {
  const query =
    statement === 'update'
      ? sql`update ${sql.table(table)} set ${sql.ref(column)} = ${sql.ref(column)} where false`
      : sql`delete from ${sql.table(table)} where false`;
  try {
    await query.execute(db);
    return 'allowed';
  } catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
  }
}

describe('the application role', () => {
  it('connects as citeladder_app, not the schema owner', async () => {
    const { rows } = await sql<{ role: string }>`select current_user as role`.execute(db);
    expect(rows).toEqual([{ role: 'citeladder_app' }]);
  });

  it('is refused UPDATE and DELETE on exactly the append-only tables', async () => {
    const { rows } = await sql<{ table: string; column: string }>`
      select distinct on (c.relname) c.relname::text as table, a.attname::text as column
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
        and c.relname <> 'schema_migrations'
      order by c.relname, a.attnum`.execute(db);
    rows.sort((a, b) => (a.table < b.table ? -1 : 1));
    const refused: string[] = [];
    for (const { table, column } of rows) {
      const update = await outcome('update', table, column);
      const remove = await outcome('delete', table);
      if (update === '42501' && remove === '42501') refused.push(table);
      else expect([table, update, remove]).toEqual([table, 'allowed', 'allowed']);
    }
    expect(refused).toEqual(APPEND_ONLY);
  });

  it('holds no grant on any partition, reaching partitioned rows through the parent', async () => {
    const { rows } = await sql<{ table: string; direct: boolean }>`
      select c.relname::text as table,
        has_table_privilege(c.oid, 'select, insert, update, delete') as direct
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relispartition
      order by 1`.execute(db);
    expect(rows.find((row) => row.table === 'site_crawl_events_default')).toEqual({
      table: 'site_crawl_events_default',
      direct: false,
    });
    expect(rows.filter((row) => row.direct)).toEqual([]);
  });

  it('still row-locks append-only grants, as billing serialization does', async () => {
    const member = await fixtures.user();
    const workspace = await fixtures.ownedWorkspace(member);
    const account = await billingAccount(db, workspace);
    const id = await grant(db, account, { key: 'prompt_slots', value: 5 });
    const locked = await db
      .transaction()
      .execute((trx) =>
        trx.selectFrom('account_grants').select('id').where('id', '=', id).forUpdate().execute(),
      );
    expect(locked).toEqual([{ id }]);
  });

  it('appends a ledger grant, cannot rewrite it, and still removes it with its workspace', async () => {
    const member = await fixtures.user();
    const workspace = await fixtures.ownedWorkspace(member);
    const account = await billingAccount(db, workspace);
    const id = await grant(db, account, { key: 'prompt_slots', value: 5 });

    await expect(
      db.updateTable('account_grants').set({ value: 500 }).where('id', '=', id).execute(),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      db.deleteFrom('account_grants').where('id', '=', id).execute(),
    ).rejects.toMatchObject({ code: '42501' });
    const kept = await db
      .selectFrom('account_grants')
      .select('value')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(kept).toEqual({ value: 5 });

    await db.deleteFrom('workspaces').where('id', '=', workspace).execute();
    const left = await asOwner((schemaOwner) =>
      schemaOwner.selectFrom('account_grants').select('id').where('id', '=', id).execute(),
    );
    expect(left).toEqual([]);
  });

  it('cannot create tables or read the migration ledger', async () => {
    const table = `app_role_probe_${randomUUID().replaceAll('-', '')}`;
    await expect(
      sql`create table ${sql.table(table)} (id integer)`.execute(db),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      sql`select version from public.schema_migrations`.execute(db),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
