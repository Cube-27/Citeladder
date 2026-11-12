/**
 * The combined transaction lock DAG (architecture.md) at the real PostgreSQL
 * boundary: Site Health controls, crawl admission, worker publication and
 * grant changes take their locks in one order, so their interleavings wait
 * instead of deadlocking.
 */
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { policy } from '../src/config.ts';
import { poolOptions, type Database } from '../src/db/database.ts';
import { issueBundle } from '../src/entitlements/grants.ts';
import type { DB } from '../src/generated/db-schema.ts';
import { lockRuntime } from '../src/site-health/frontier.ts';
import { refreshRuntime } from '../src/site-health/plan-runtime.ts';
import { createCrawl } from '../src/site-health/planner.ts';
import { replaceMonitoredSet, rerunPage } from '../src/site-health/selection.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { SiteFixtures, type SiteSeed } from './site-health-fixtures.ts';
import { testConfig, testDatabase } from './support.ts';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const config = testConfig();
const db = testDatabase(config);
const fixtures = new SiteFixtures(db);
const accounts: string[] = [];

/** Every statement the logging connection runs, in order. */
const statements: string[] = [];
const logged: Database = new Kysely<DB>({
  dialect: new PostgresDialect({ pool: new pg.Pool(poolOptions(config)) }),
  log: (event) => {
    if (event.level === 'query') statements.push(event.query.sql);
  },
});

afterAll(async () => {
  if (accounts.length) {
    await db.deleteFrom('consumable_ledger').where('billing_account_id', 'in', accounts).execute();
    await db.deleteFrom('billing_accounts').where('id', 'in', accounts).execute();
  }
  await fixtures.cleanup();
  await logged.destroy();
  await db.destroy();
});

/** The combined lock DAG, Site Health prefix first: a transaction only moves rightward. */
const RANK = [
  'project',
  'runtime',
  'membership',
  'crawl',
  'profile',
  'capacity',
  'account',
  'grants',
] as const;
const TABLE_LOCKS: Record<string, string> = {
  projects: 'project',
  workspace_site_health_runtime: 'runtime',
  monitored_site_urls: 'membership',
  site_crawls: 'crawl',
  site_health_profiles: 'profile',
  billing_accounts: 'account',
  account_grants: 'grants',
};

/** The lock a statement acquires, or null for one that takes no lock of the DAG. */
function lockOf(statement: string) {
  if (statement.includes('pg_advisory_xact_lock')) return 'capacity';
  const locking = /\bfor (?:update|no key update)\b/u.test(statement);
  const upsert = /^insert into "(workspace_site_health_runtime|site_health_profiles)"/u.exec(
    statement,
  );
  if (upsert) return TABLE_LOCKS[upsert[1]!]!;
  if (!locking) return null;
  const table = /\bfrom "(\w+)"/u.exec(statement)?.[1] ?? 'unknown';
  return TABLE_LOCKS[table] ?? table;
}

/**
 * Run `work` in one logged transaction and return the order in which it first
 * took each lock, asserting that order never steps back in the DAG.
 */
async function lockOrder(work: (trx: Database) => Promise<unknown>) {
  statements.length = 0;
  await logged.transaction().execute(work);
  const order: string[] = [];
  for (const statement of statements) {
    const lock = lockOf(statement);
    if (lock && !order.includes(lock)) order.push(lock);
  }
  const ranks = order.map((lock) => RANK.indexOf(lock as (typeof RANK)[number]));
  expect(ranks.every((rank, index) => rank >= 0 && rank >= (ranks[index - 1] ?? 0))).toBe(true);
  return order;
}

async function monitoredCrawl(limit: number) {
  const seed = await fixtures.crawl('running');
  const account = await billingAccount(db, seed.workspaceId);
  accounts.push(account);
  await grant(db, account, { key: 'monitored_urls', value: limit });
  const page = await fixtures.page(seed, '/a', {}, { observed: true });
  await db
    .transaction()
    .execute((trx) => replaceMonitoredSet(trx, seed.workspaceId, seed.projectId, [page.id], 1));
  return { seed, account, page };
}

async function backendPid(trx: Database) {
  const result = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx);
  return result.rows[0]!.pid;
}

/** Wait until another backend is queued behind a lock `pid` holds. */
async function blocksAnother(pid: number) {
  await vi.waitFor(
    async () => {
      const blocked = await sql<{ waiting: boolean }>`select exists (
        select 1 from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))
      ) as waiting`.execute(db);
      expect(blocked.rows[0]!.waiting).toBe(true);
    },
    { timeout: 5000, interval: 20 },
  );
}

async function monitoredLimit(seed: SiteSeed) {
  const row = await db
    .selectFrom('workspace_site_health_runtime')
    .select('monitored_url_limit')
    .where('workspace_id', '=', seed.workspaceId)
    .executeTakeFirstOrThrow();
  return row.monitored_url_limit;
}

describe('Site Health lock order', () => {
  it('lets a page rerun and a discover commit interleave without deadlock, repeatedly', async () => {
    const { seed, page } = await monitoredCrawl(1);
    for (let round = 0; round < 5; round++) {
      // A discover commit locks the runtime first, then the crawl (lockSiteTask).
      const worker = await db.startTransaction().execute();
      let rerun: Promise<unknown> | undefined;
      try {
        await lockRuntime(worker, seed.workspaceId);
        rerun = db
          .transaction()
          .execute((trx) => rerunPage(trx, seed.workspaceId, seed.projectId, page.id));
        await blocksAnother(await backendPid(worker));
        const crawl = await worker
          .selectFrom('site_crawls')
          .select('id')
          .where('id', '=', seed.crawlId)
          .forNoKeyUpdate()
          .executeTakeFirstOrThrow();
        expect(crawl.id).toBe(seed.crawlId);
        await worker.commit().execute();
        expect(await rerun).toMatchObject({
          crawl_id: seed.crawlId,
          site_url_id: page.id,
          created_new_crawl: false,
        });
      } finally {
        if (!worker.isCommitted) await worker.rollback().execute();
        await rerun?.catch(() => undefined);
      }
    }
  });

  it('commits a grant change while a worker holds the runtime, then refreshes the runtime after it', async () => {
    const { seed, account } = await monitoredCrawl(1);
    expect(await monitoredLimit(seed)).toBe(1);
    const worker = await db.startTransaction().execute();
    let refresh: Promise<void> | undefined;
    try {
      await lockRuntime(worker, seed.workspaceId);
      // The billing transaction never waits on the runtime the worker holds.
      await db.transaction().execute((trx) =>
        issueBundle(trx, {
          workspaceId: seed.workspaceId,
          accountId: account,
          key: randomUUID(),
          sourceKind: 'override',
          source: { kind: 'override', actorId: seed.userId },
          specs: [{ key: 'monitored_urls', value: 4 }],
          revision: policy.entitlements.registry_revision,
          from: new Date(Date.now() - 60_000),
          until: null,
          primary: false,
          profile: '',
          priority: 0,
        }),
      );
      expect(await monitoredLimit(seed)).toBe(1);
      refresh = refreshRuntime(db, seed.workspaceId);
      await blocksAnother(await backendPid(worker));
      await worker.commit().execute();
      await refresh;
      expect(await monitoredLimit(seed)).toBe(5);
    } finally {
      if (!worker.isCommitted) await worker.rollback().execute();
      await refresh?.catch(() => undefined);
    }
  });

  it('refuses a runtime refresh inside a transaction that may hold billing locks', async () => {
    const { seed } = await monitoredCrawl(1);
    await expect(
      db.transaction().execute((trx) => refreshRuntime(trx, seed.workspaceId)),
    ).rejects.toThrow('refreshRuntime runs after the billing transaction commits');
  });

  it('takes every admission, control and grant lock in DAG order', async () => {
    const { seed, account, page } = await monitoredCrawl(2);
    expect(
      await lockOrder((trx) => rerunPage(trx, seed.workspaceId, seed.projectId, page.id)),
    ).toEqual(['project', 'runtime', 'membership', 'crawl', 'profile', 'capacity', 'account']);
    expect(
      await lockOrder((trx) =>
        replaceMonitoredSet(trx, seed.workspaceId, seed.projectId, [page.id], 2),
      ),
    ).toEqual(['project', 'runtime', 'membership', 'crawl', 'profile', 'capacity', 'account']);
    await db
      .updateTable('site_crawls')
      .set({ status: 'cancelled' })
      .where('id', '=', seed.crawlId)
      .execute();
    expect(
      await lockOrder((trx) => createCrawl(trx, seed.workspaceId, { project_id: seed.projectId })),
    ).toEqual(['project', 'runtime', 'profile', 'capacity', 'account']);
    expect(
      await lockOrder((trx) =>
        issueBundle(trx, {
          workspaceId: seed.workspaceId,
          accountId: account,
          key: randomUUID(),
          sourceKind: 'override',
          source: { kind: 'override', actorId: seed.userId },
          specs: [{ key: 'monitored_urls', value: 1 }],
          revision: policy.entitlements.registry_revision,
          from: new Date(),
          until: null,
          primary: false,
          profile: '',
          priority: 0,
        }),
      ),
    ).toEqual(['capacity', 'account']);
  });
});
