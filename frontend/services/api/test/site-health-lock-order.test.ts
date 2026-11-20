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
import { SITE_HEALTH_LANE, TaskQueue, type SiteTask } from '../src/queue/task-queue.ts';
import { cancelCrawl } from '../src/site-health/controls.ts';
import { lockRuntime } from '../src/site-health/frontier.ts';
import { reconcileCrawl } from '../src/site-health/lifecycle.ts';
import { refreshRuntime } from '../src/site-health/plan-runtime.ts';
import { createCrawl } from '../src/site-health/planner.ts';
import { rerunPage } from '../src/site-health/selection.ts';
import { commitTask } from '../src/site-health/site-task.ts';
import { canonicalIdentity } from '../src/site-health/url-identity.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { SiteFixtures, type SiteSeed } from './site-health-fixtures.ts';
import { asOwner, testConfig, testDatabase } from './support.ts';

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
    // The ledger is append-only for the application role.
    await asOwner((owner) =>
      owner.deleteFrom('consumable_ledger').where('billing_account_id', 'in', accounts).execute(),
    );
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
  await fixtures.monitor(seed, [page.id]);
  // The runtime row the worker and controls lock, resolved from the grant.
  await refreshRuntime(db, seed.workspaceId);
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

/** A URL a discover commit admits into the seed's project. */
function foundUrl(seed: SiteSeed, path: string) {
  const identity = canonicalIdentity(path, seed.root);
  const now = new Date();
  return {
    id: randomUUID(),
    workspace_id: seed.workspaceId,
    project_id: seed.projectId,
    url_hash: identity.hash,
    normalized_url: identity.url,
    display_url: identity.url,
    host: 'example.test',
    item_kind: 'page',
    depth: 1,
    corpus_disposition: 'eligible',
    disposition_reason: '',
    disposition_version: 'fixture',
    first_seen_at: now,
    last_seen_at: now,
    first_seen_crawl_id: seed.crawlId,
    last_seen_crawl_id: seed.crawlId,
    latest_content_type: 'text/html',
    latest_source_kind: 'link',
    latest_title: '',
  };
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
  it('refuses a page rerun during a discover commit without waiting on its locks', async () => {
    const { seed, page } = await monitoredCrawl(1);
    // A discover commit locks the runtime first, then the crawl (lockSiteTask).
    const worker = await db.startTransaction().execute();
    try {
      await lockRuntime(worker, seed.workspaceId);
      // It writes a URL it found: the foreign key key-share locks the project row.
      await worker.insertInto('site_urls').values(foundUrl(seed, '/found')).execute();
      // The running crawl refuses the rerun before the runtime lock the worker holds (SH-B4).
      await expect(
        db
          .transaction()
          .execute((trx) => rerunPage(trx, seed.workspaceId, seed.projectId, page.id)),
      ).rejects.toMatchObject({ status: 409, code: 'crawl_already_active' });
      const crawl = await worker
        .selectFrom('site_crawls')
        .select('id')
        .where('id', '=', seed.crawlId)
        .forNoKeyUpdate()
        .executeTakeFirstOrThrow();
      expect(crawl.id).toBe(seed.crawlId);
      await worker.commit().execute();
    } finally {
      if (!worker.isCommitted) await worker.rollback().execute();
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
          reason: 'test override',
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
    const stopAll = () =>
      db
        .updateTable('site_crawls')
        .set({ status: 'cancelled' })
        .where('project_id', '=', seed.projectId)
        .execute();
    await stopAll();
    expect(
      await lockOrder((trx) => rerunPage(trx, seed.workspaceId, seed.projectId, page.id)),
    ).toEqual(['project', 'runtime', 'membership', 'crawl', 'profile', 'capacity', 'account']);
    await stopAll();
    expect(
      await lockOrder((trx) => createCrawl(trx, seed.workspaceId, { project_id: seed.projectId })),
    ).toEqual(['project', 'runtime', 'membership', 'profile', 'capacity', 'account']);
    expect(
      await lockOrder((trx) =>
        issueBundle(trx, {
          workspaceId: seed.workspaceId,
          accountId: account,
          key: randomUUID(),
          sourceKind: 'override',
          source: { kind: 'override', actorId: seed.userId },
          reason: 'test override',
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

  it('lets page commits share the crawl lock, while Stop waits for them and stops the next', async () => {
    const seed = await fixtures.crawl('running');
    const owner = 'share-fence';
    const [first, second, third] = await Promise.all(
      ['/a', '/b', '/c'].map(async (path) => leased(await fixtures.analyzable(seed, path), owner)),
    );
    const ctx = {
      db,
      owner,
      queue: new TaskQueue(db, SITE_HEALTH_LANE, { leaseTtlSeconds: 60 }),
      signal: new AbortController().signal,
    };
    const order: string[] = [];
    const released = Promise.withResolvers<void>();
    const holding = Promise.withResolvers<number>();
    const open = commitTask(ctx, first!, async (trx, lock) => {
      await lock('share');
      holding.resolve(await backendPid(trx));
      await released.promise;
    }).then((committed) => order.push(`first:${committed}`));
    const pid = await holding.promise;
    // A second page commit takes the same crawl lock while the first holds it.
    expect(await commitTask(ctx, second!, async (_trx, lock) => void (await lock('share')))).toBe(
      true,
    );
    const stop = cancelCrawl(db, seed.workspaceId, seed.crawlId).then(() => order.push('stop'));
    await blocksAnother(pid);
    released.resolve();
    await Promise.all([open, stop]);
    // A commit after Stop finds the crawl stopped and writes nothing.
    expect(await commitTask(ctx, third!, async (_trx, lock) => void (await lock('share')))).toBe(
      false,
    );
    expect(order).toEqual(['first:true', 'stop']);
  });

  it('assesses a crawl again under its lock when a crawl write lands after the reconcile read it', async () => {
    const seed = await fixtures.crawl('running');
    await db
      .updateTable('site_crawls')
      .set({ discovery_status: 'running', analysis_status: 'running', discovered_url_count: 0 })
      .where('id', '=', seed.crawlId)
      .execute();
    const discover = await fixtures.task(seed, 'discover');
    // Outstanding analysis keeps the crawl undrained.
    await fixtures.analyzable(seed, '/a');
    const writer = await db.startTransaction().execute();
    try {
      await lockedCrawl(writer, seed);
      const reconcile = reconcileCrawl(db, seed.workspaceId, seed.crawlId, { refreshScore: false });
      // The reconcile read the crawl with its discovery open and now waits on the lock.
      await blocksAnother(await backendPid(writer));
      // A discover commit: its page found, its task settled.
      await writer
        .updateTable('site_crawl_tasks')
        .set({ status: 'succeeded', completed_at: new Date() })
        .where('id', '=', discover)
        .execute();
      await writer
        .updateTable('site_crawls')
        .set({ discovered_url_count: 1, updated_at: new Date() })
        .where('id', '=', seed.crawlId)
        .execute();
      await writer.commit().execute();
      await reconcile;
    } finally {
      if (!writer.isCommitted) await writer.rollback().execute();
    }
    const crawl = await db
      .selectFrom('site_crawls')
      .select(['discovery_status', 'analysis_status'])
      .where('id', '=', seed.crawlId)
      .executeTakeFirstOrThrow();
    expect(crawl).toEqual({ discovery_status: 'completed', analysis_status: 'running' });
  });

  it('recounts a stopped crawl under its lock, so a task settling meanwhile is not counted running', async () => {
    const seed = await fixtures.crawl('running');
    const page = await leased(await fixtures.analyzable(seed, '/a'), 'stop-recount');
    await db
      .updateTable('site_crawls')
      .set({ status: 'cancelled', completed_at: new Date() })
      .where('id', '=', seed.crawlId)
      .execute();
    const running = async () => {
      const row = await db
        .selectFrom('site_crawls')
        .select(sql<number>`(terminal_counters ->> 'running')::int`.as('running'))
        .where('id', '=', seed.crawlId)
        .executeTakeFirstOrThrow();
      return row.running;
    };
    await reconcileCrawl(db, seed.workspaceId, seed.crawlId);
    expect(await running()).toBe(1);
    const writer = await db.startTransaction().execute();
    try {
      await lockedCrawl(writer, seed);
      const reconcile = reconcileCrawl(db, seed.workspaceId, seed.crawlId);
      await blocksAnother(await backendPid(writer));
      // The task Stop skipped cancels itself; no crawl column moves.
      await writer
        .updateTable('site_crawl_tasks')
        .set({ status: 'cancelled', completed_at: new Date() })
        .where('id', '=', page.id)
        .execute();
      await writer.commit().execute();
      await reconcile;
    } finally {
      if (!writer.isCommitted) await writer.rollback().execute();
    }
    expect(await running()).toBe(0);
  });
});

/** The analyze task leased to `owner`, as a claim hands it to the worker. */
function leased(page: { taskId: string }, owner: string): Promise<SiteTask> {
  return db
    .updateTable('site_crawl_tasks')
    .set({ status: 'leased', lease_owner: owner, lease_expires_at: new Date(Date.now() + 60_000) })
    .where('id', '=', page.taskId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

function lockedCrawl(trx: Database, seed: SiteSeed) {
  return trx
    .selectFrom('site_crawls')
    .select('id')
    .where('workspace_id', '=', seed.workspaceId)
    .where('id', '=', seed.crawlId)
    .forNoKeyUpdate()
    .executeTakeFirstOrThrow();
}
