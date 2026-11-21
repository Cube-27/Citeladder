import { sql, type KyselyPlugin, type QueryId, type RootOperationNode } from 'kysely';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { policy } from '../src/config.ts';
import { record } from '../src/db/json.ts';
import { compareText } from '../src/text-order.ts';
import { cancelCrawl } from '../src/site-health/controls.ts';
import { reserveCrawlFetches } from '../src/site-health/fetch-budget.ts';
import { publishCancelledCrawls } from '../src/site-health/lifecycle.ts';
import { SiteHealthWorker } from '../src/workers/site-health-worker.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { asOwner, testDatabase } from './support.ts';
import { FinalizeFixtures, type SiteSeed } from './site-health-finalize-fixtures.ts';

type Hook = () => Promise<void>;
const nextBatch = vi.hoisted(() => ({
  before: null as Hook | null,
  after: null as Hook | null,
}));
vi.mock('../src/queue/task-queue.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/queue/task-queue.ts')>();
  const take = (key: 'before' | 'after') => {
    const hook = nextBatch[key];
    nextBatch[key] = null;
    return hook;
  };
  return {
    ...actual,
    asyncCommit: async <R>(
      database: Parameters<typeof actual.asyncCommit>[0],
      run: (trx: Parameters<typeof actual.asyncCommit>[0]) => Promise<R>,
    ) => {
      const before = take('before');
      const result = await actual.asyncCommit(database, async (trx) => {
        await before?.();
        return run(trx);
      });
      await take('after')?.();
      return result;
    },
  };
});

const db = testDatabase();
const fixtures = new FinalizeFixtures(db);
const accounts: string[] = [];
afterAll(async () => {
  if (accounts.length) {
    await asOwner((owner) =>
      owner.deleteFrom('consumable_ledger').where('billing_account_id', 'in', accounts).execute(),
    );
    await db.deleteFrom('billing_accounts').where('id', 'in', accounts).execute();
  }
  await fixtures.cleanup();
  await db.destroy();
});
const finalize = (seed: SiteSeed) => fixtures.terminalize(seed);
const crawlRow = (id: string) =>
  db.selectFrom('site_crawls').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const finalizeTasks = (seed: SiteSeed) =>
  db
    .selectFrom('site_crawl_tasks')
    .select(['status', 'attempt_count', 'max_attempts'])
    .where('crawl_id', '=', seed.crawlId)
    .where('task_kind', '=', 'finalize')
    .orderBy('created_at')
    .execute();
const retryNow = (seed: SiteSeed) =>
  db
    .updateTable('site_crawl_tasks')
    .set({ available_at: new Date(0) })
    .where('crawl_id', '=', seed.crawlId)
    .where('task_kind', '=', 'finalize')
    .execute();
const CRAWL_TABLES = new Set(['site_page_analyses', 'site_rule_evaluations', 'site_issues']);
function primaryTable(node: RootOperationNode) {
  if (node.kind === 'SelectQueryNode')
    return /"name":"(\w+)"/.exec(JSON.stringify(node.from))?.[1] ?? '';
  const text = node.kind === 'RawNode' ? node.sqlFragments.join(' ') : '';
  return /\bfrom\s+(\w+)/.exec(text)?.[1] ?? '';
}
function rowCounter() {
  const tables = new Map<QueryId, string>();
  const most: Record<string, number> = {};
  const plugin: KyselyPlugin = {
    transformQuery: ({ node, queryId }) => {
      tables.set(queryId, primaryTable(node));
      return node;
    },
    transformResult: async ({ result, queryId }) => {
      const table = tables.get(queryId) ?? '';
      tables.delete(queryId);
      if (CRAWL_TABLES.has(table)) most[table] = Math.max(most[table] ?? 0, result.rows.length);
      return result;
    },
  };
  return { db: db.withPlugin(plugin), most };
}
async function monitoredPage(seed: SiteSeed, path: string, facts: Record<string, unknown> = {}) {
  const member = await fixtures.analyzable(seed, path);
  await db.deleteFrom('site_crawl_tasks').where('id', '=', member.taskId).execute();
  const page = await fixtures.page(seed, path, facts, { siteUrlId: member.siteUrlId });
  await fixtures.evaluation(seed, page, 'technical.indexable', 'satisfied');
  return page;
}

describe('finalize task', () => {
  it('rolls back a failed batch whole and replays a committed one as a no-op', async () => {
    const seed = await fixtures.crawl('running');
    const page = await monitoredPage(seed, '/', { canonical_declarations: ['/a', '/b'] });
    await monitoredPage(seed, '/about');
    const state = async () => ({
      analyses: (
        await db
          .selectFrom('site_page_analyses')
          .select(['supersedes_analysis_id', 'is_current', 'finalized_at'])
          .where('crawl_id', '=', seed.crawlId)
          .execute()
      )
        .map(
          (row) => `${row.supersedes_analysis_id}:${row.is_current}:${row.finalized_at !== null}`,
        )
        .toSorted(compareText),
      evaluations: (
        await db
          .selectFrom('site_rule_evaluations')
          .select(sql<number>`count(*)::int`.as('count'))
          .where('analysis_id', '=', page.analysisId)
          .executeTakeFirstOrThrow()
      ).count,
      status: (await crawlRow(seed.crawlId)).status,
    });
    const initial = await state();
    nextBatch.before = () => Promise.reject(new Error('batch write failed'));
    expect(await finalize(seed)).toBe(true);
    expect(await state()).toEqual(initial);
    await retryNow(seed);
    nextBatch.after = () => Promise.reject(new Error('runner stopped after a batch'));
    expect(await finalize(seed)).toBe(true);
    const batched = await state();
    expect(batched.status).toBe('running');
    expect(batched.analyses.filter((row) => row.endsWith(':true:true'))).toHaveLength(2);
    await retryNow(seed);
    expect(await finalize(seed)).toBe(true);
    const published = await state();
    expect(published.analyses).toEqual(batched.analyses);
    expect(published.evaluations).toBe(batched.evaluations);
    expect(published.status).not.toBe('running');
    const snapshot = await db
      .selectFrom('site_health_snapshots as s')
      .innerJoin('site_health_snapshot_analyses as a', 'a.snapshot_id', 's.id')
      .select('a.analysis_id')
      .where('s.crawl_id', '=', seed.crawlId)
      .execute();
    const finals = await db
      .selectFrom('site_page_analyses')
      .select('id')
      .where('crawl_id', '=', seed.crawlId)
      .where('is_current', '=', true)
      .execute();
    expect(new Set(snapshot.map((row) => row.analysis_id))).toEqual(
      new Set(finals.map((row) => row.id)),
    );
  });

  it('judges the pages an interrupted pass left against the pages it already finalized', async () => {
    const seed = await fixtures.crawl('running');
    const text = Array.from({ length: 80 }, (_, i) => `topic${i % 13} detail${i}`).join(' ');
    const copy = {
      has_html: true,
      delivery: { status_code: 200 },
      robots: { noindex: false },
      primary_content_text: text,
      links: { anchors: [] },
    };
    await fixtures.page(seed, '/', { has_html: true, links: { anchors: [] } });
    const first = await fixtures.page(seed, '/a', copy);
    const second = await fixtures.page(seed, '/b', copy);
    const size = policy.site_health.crawl.finalize.batch_pages;
    policy.site_health.crawl.finalize.batch_pages = 2;
    try {
      nextBatch.after = () => Promise.reject(new Error('runner stopped after a batch'));
      expect(await finalize(seed)).toBe(true);
      await retryNow(seed);
      expect(await finalize(seed)).toBe(true);
    } finally {
      policy.site_health.crawl.finalize.batch_pages = size;
    }
    const duplicates = await db
      .selectFrom('site_issues')
      .select('site_url_id')
      .where('crawl_id', '=', seed.crawlId)
      .where('rule_id', '=', 'technical.duplicate_content')
      .where('is_current', '=', true)
      .execute();
    expect(duplicates.map((row) => row.site_url_id).toSorted(compareText)).toEqual(
      [first.id, second.id].toSorted(compareText),
    );
  });

  it('fails a crawl whose finalization fails three times, and keeps a cancelled crawl cancelled', async () => {
    const run = async (seed: SiteSeed) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await retryNow(seed); // NOSONAR -- Attempts in order.
        nextBatch.before = () => Promise.reject(new Error('batch write failed'));
        await finalize(seed); // NOSONAR -- Attempts in order.
      }
      expect(await finalize(seed)).toBe(false);
      return finalizeTasks(seed);
    };
    const seed = await fixtures.crawl('running');
    await fixtures.page(seed, '/', {});
    const account = await billingAccount(db, seed.workspaceId);
    accounts.push(account);
    await grant(db, account, { key: 'site_health_page_fetches_per_period', value: 5 });
    await reserveCrawlFetches(db, await crawlRow(seed.crawlId), 2, new Date());
    expect(await run(seed)).toEqual([{ status: 'failed', attempt_count: 3, max_attempts: 3 }]);
    const crawl = await crawlRow(seed.crawlId);
    expect([crawl.status, crawl.error_message]).toEqual([
      'failed',
      policy.site_health.crawl.finalize.error_message,
    ]);
    expect(record(crawl.terminal_counters)).toMatchObject({ queued: 0, running: 0 });
    const ledger = await db
      .selectFrom('consumable_ledger')
      .select(['entry_kind', 'units'])
      .where('site_crawl_id', '=', seed.crawlId)
      .execute();
    const units = (kind: string) =>
      ledger.filter((row) => row.entry_kind === kind).reduce((sum, row) => sum + row.units, 0);
    expect([units('reservation'), units('release'), units('debit')]).toEqual([2, 2, 1]);
    const failed = await db
      .selectFrom('site_crawl_events')
      .select('payload')
      .where('crawl_id', '=', seed.crawlId)
      .where('event_type', '=', 'crawl.failed')
      .execute();
    expect(failed.map((row) => record(record(row.payload).failure).code)).toEqual([
      'finalize_failed',
    ]);
    const stopped = await fixtures.crawl('running');
    await monitoredPage(stopped, '/');
    await cancelCrawl(db, stopped.workspaceId, stopped.crawlId);
    await publishCancelledCrawls(db, 50);
    expect((await run(stopped)).map((row) => row.status)).toEqual(['failed']);
    await publishCancelledCrawls(db, 50);
    expect((await crawlRow(stopped.crawlId)).status).toBe('cancelled');
    expect(await finalizeTasks(stopped)).toHaveLength(1);
  });

  it('publishes a crawl stopped between finalize batches as cancelled, each page once', async () => {
    const seed = await fixtures.crawl('running');
    for (const path of ['/', '/a', '/b']) await monitoredPage(seed, path); // NOSONAR -- Fixture rows in order.
    const size = policy.site_health.crawl.finalize.batch_pages;
    policy.site_health.crawl.finalize.batch_pages = 1;
    try {
      nextBatch.after = () => cancelCrawl(db, seed.workspaceId, seed.crawlId);
      expect(await finalize(seed)).toBe(true);
      const statuses = async () => (await finalizeTasks(seed)).map((row) => row.status);
      expect(await statuses()).toEqual(['cancelled']);
      const finalized = () =>
        db
          .selectFrom('site_page_analyses')
          .select('supersedes_analysis_id')
          .where('crawl_id', '=', seed.crawlId)
          .where('finalized_at', 'is not', null)
          .execute();
      expect(await finalized()).toHaveLength(1);
      await publishCancelledCrawls(db, 50);
      expect(await finalize(seed)).toBe(true);
      expect(await statuses()).toEqual(['cancelled', 'succeeded']);
      const rows = await finalized();
      expect(new Set(rows.map((row) => row.supersedes_analysis_id)).size).toBe(3);
      expect(rows).toHaveLength(3);
      expect((await crawlRow(seed.crawlId)).status).toBe('cancelled');
      expect(
        await db
          .selectFrom('site_health_snapshots')
          .select('id')
          .where('crawl_id', '=', seed.crawlId)
          .execute(),
      ).toHaveLength(1);
    } finally {
      policy.site_health.crawl.finalize.batch_pages = size;
    }
  });

  it('publishes a crawl larger than one batch without any read holding more than one batch', async () => {
    const seed = await fixtures.crawl('running');
    const paths = ['/', '/a', '/b', '/c', '/d', '/e', '/f', '/g', '/h'];
    for (const path of paths) await monitoredPage(seed, path); // NOSONAR -- Fixture rows in order.
    const settings = policy.site_health.crawl.finalize;
    const sizes = { ...settings };
    Object.assign(settings, { batch_pages: 2, read_pages: 2, projection_pages: 2 });
    const counter = rowCounter();
    try {
      const worker = new SiteHealthWorker(counter.db, {
        taskScope: { workspaceId: seed.workspaceId, crawlId: seed.crawlId },
      });
      expect(await fixtures.terminalize(seed, worker)).toBe(true);
    } finally {
      Object.assign(settings, sizes);
    }
    expect((await crawlRow(seed.crawlId)).status).toBe('completed');
    const published = await db
      .selectFrom('site_health_snapshots as s')
      .innerJoin('site_health_snapshot_analyses as a', 'a.snapshot_id', 's.id')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('s.crawl_id', '=', seed.crawlId)
      .executeTakeFirstOrThrow();
    expect(published.count).toBe(paths.length);
    const perPage = await db
      .selectFrom('site_rule_evaluations')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('workspace_id', '=', seed.workspaceId)
      .groupBy('analysis_id')
      .orderBy(sql`count(*)`, 'desc')
      .executeTakeFirstOrThrow();
    expect(counter.most.site_page_analyses).toBe(2);
    expect(counter.most.site_rule_evaluations).toBeLessThanOrEqual(3 * perPage.count);
  });
});
