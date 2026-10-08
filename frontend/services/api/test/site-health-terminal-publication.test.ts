import type { Insertable } from 'kysely';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { SiteCrawls } from '../src/generated/db-schema.ts';
import { finalizeCrawlAnalyses } from '../src/site-health/lifecycle-finalize.ts';
import { persistCrawlSnapshot } from '../src/site-health/snapshot.ts';
import {
  publishCancelledCrawls,
  reconcileAfterTask,
  reconcileCrawl,
  reconcileOverdue,
  ScoreRefreshCadence,
} from '../src/site-health/lifecycle.ts';
import { siteWorkerSettings } from '../src/site-health/runtime.ts';
import { SiteHealthWorker } from '../src/workers/site-health-worker.ts';
import { testDatabase } from './support.ts';
import { SiteFixtures, type SiteSeed } from './site-health-fixtures.ts';

const db = testDatabase();
const fixtures = new SiteFixtures(db);
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});
async function finalize(seed: SiteSeed) {
  return db.transaction().execute(async (trx) => {
    const crawl = await trx
      .selectFrom('site_crawls')
      .selectAll()
      .where('id', '=', seed.crawlId)
      .where('workspace_id', '=', seed.workspaceId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    await finalizeCrawlAnalyses(trx, crawl);
  });
}

describe('terminal analysis publication', () => {
  it('terminalizes an empty plan exactly once with a null-score snapshot', async () => {
    const seed = await fixtures.crawl('running');
    await Promise.all([
      reconcileCrawl(db, seed.workspaceId, seed.crawlId),
      reconcileCrawl(db, seed.workspaceId, seed.crawlId),
    ]);
    const crawl = await db
      .selectFrom('site_crawls')
      .selectAll()
      .where('id', '=', seed.crawlId)
      .executeTakeFirstOrThrow();
    expect(crawl.status).toBe('failed');
    const snapshots = await db
      .selectFrom('site_health_snapshots')
      .selectAll()
      .where('crawl_id', '=', seed.crawlId)
      .execute();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.web_fundamentals_score).toBeNull();
    expect(
      await db
        .selectFrom('site_crawl_events')
        .select('id')
        .where('crawl_id', '=', seed.crawlId)
        .where('event_type', '=', 'crawl.failed')
        .execute(),
    ).toHaveLength(1);
  });

  it('replaying snapshot publication cannot diverge the frozen summary', async () => {
    const seed = await fixtures.crawl();
    const crawl = await db
      .selectFrom('site_crawls')
      .selectAll()
      .where('id', '=', seed.crawlId)
      .executeTakeFirstOrThrow();
    const publish = () =>
      db.transaction().execute(async (trx) => {
        await trx
          .selectFrom('site_crawls')
          .select('id')
          .where('id', '=', seed.crawlId)
          .forUpdate()
          .execute();
        return persistCrawlSnapshot(trx, crawl, true);
      });
    expect(await publish()).toBe(true);
    const first = await db
      .selectFrom('site_crawls')
      .select('score_summary')
      .where('id', '=', seed.crawlId)
      .executeTakeFirstOrThrow();
    expect(await publish()).toBe(false);
    expect(
      await db
        .selectFrom('site_crawls')
        .select('score_summary')
        .where('id', '=', seed.crawlId)
        .executeTakeFirstOrThrow(),
    ).toEqual(first);
  });
  it('serializes concurrent finalization and preserves initial evaluation ownership', async () => {
    const seed = await fixtures.crawl('running');
    const page = await fixtures.page(
      seed,
      '/',
      {
        canonical_declarations: ['/'],
        links: { anchors: [] },
        hreflang_alternates: [],
      },
      { observed: true },
    );
    await Promise.all([finalize(seed), finalize(seed)]);
    const analyses = await db
      .selectFrom('site_page_analyses')
      .selectAll()
      .where('crawl_id', '=', seed.crawlId)
      .execute();
    expect(analyses).toHaveLength(2);
    const final = analyses.find((row) => row.is_current)!;
    expect(final.supersedes_analysis_id).toBe(page.analysisId);
    expect(final.finalized_at).not.toBeNull();
    const evaluations = await db
      .selectFrom('site_rule_evaluations')
      .selectAll()
      .where('analysis_id', '=', page.analysisId)
      .execute();
    expect(new Set(final.source_evaluation_ids)).toEqual(new Set(evaluations.map((row) => row.id)));
    expect(
      evaluations.find((row) => row.rule_id === 'technical.canonical_integrity')?.outcome,
    ).toBe('unknown');
    expect(final.source_artifact_ids).toEqual([page.artifactId]);
  });

  it('rolls back evaluations and revisions with the enclosing publication transaction', async () => {
    const seed = await fixtures.crawl('running');
    const page = await fixtures.page(seed, '/', { canonical_declarations: ['/a', '/b'] });
    await expect(
      db.transaction().execute(async (trx) => {
        const crawl = await trx
          .selectFrom('site_crawls')
          .selectAll()
          .where('id', '=', seed.crawlId)
          .forUpdate()
          .executeTakeFirstOrThrow();
        await finalizeCrawlAnalyses(trx, crawl);
        throw new Error('snapshot write failed');
      }),
    ).rejects.toThrow('snapshot write failed');
    const rows = await db
      .selectFrom('site_page_analyses')
      .selectAll()
      .where('crawl_id', '=', seed.crawlId)
      .execute();
    expect(rows.map((row) => [row.id, row.is_current, row.finalized_at])).toEqual([
      [page.analysisId, true, null],
    ]);
    expect(
      await db
        .selectFrom('site_rule_evaluations')
        .select('id')
        .where('analysis_id', '=', page.analysisId)
        .execute(),
    ).toEqual([]);
  });

  it('does not publish another workspace through a mismatched crawl scope', async () => {
    const seed = await fixtures.crawl('running');
    const foreign = await fixtures.crawl('running');
    const page = await fixtures.page(seed, '/', {});
    const crawl = await db
      .selectFrom('site_crawls')
      .selectAll()
      .where('id', '=', seed.crawlId)
      .executeTakeFirstOrThrow();
    await db
      .transaction()
      .execute((trx) =>
        finalizeCrawlAnalyses(trx, { ...crawl, workspace_id: foreign.workspaceId }),
      );
    const saved = await db
      .selectFrom('site_page_analyses')
      .selectAll()
      .where('id', '=', page.analysisId)
      .executeTakeFirstOrThrow();
    expect(saved.is_current).toBe(true);
    expect(saved.finalized_at).toBeNull();
  });
});

const LONG_AGO = new Date('2000-01-01T00:00:00Z');
const crawlRow = (id: string) =>
  db.selectFrom('site_crawls').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const tasksOf = (id: string, kind: string) =>
  db
    .selectFrom('site_crawl_tasks')
    .selectAll()
    .where('crawl_id', '=', id)
    .where('task_kind', '=', kind)
    .execute();
const snapshots = (id: string) =>
  db.selectFrom('site_health_snapshots').select('id').where('crawl_id', '=', id).execute();
const events = (id: string, type: string) =>
  db
    .selectFrom('site_crawl_events')
    .select('payload')
    .where('crawl_id', '=', id)
    .where('event_type', '=', type)
    .execute();
async function running(changes: Partial<Insertable<SiteCrawls>> = {}) {
  const seed = await fixtures.crawl('running');
  await db
    .updateTable('site_crawls')
    .set({ analysis_status: 'running', discovered_url_count: 2, completed_at: null, ...changes })
    .where('id', '=', seed.crawlId)
    .execute();
  return seed;
}
/** A completed analysis of an active monitored page, settled by its own analyze task. */
async function monitoredPage(seed: SiteSeed, path: string) {
  const member = await fixtures.analyzable(seed, path);
  await db.deleteFrom('site_crawl_tasks').where('id', '=', member.taskId).execute();
  const page = await fixtures.page(seed, path, {}, { siteUrlId: member.siteUrlId });
  await fixtures.evaluation(seed, page, 'technical.indexable', 'satisfied');
  return page;
}
const settled = (seed: SiteSeed, taskId: string) => ({
  id: taskId,
  crawl_id: seed.crawlId,
  workspace_id: seed.workspaceId,
});
const cadence = () => new ScoreRefreshCadence(siteWorkerSettings({}).scoreRefresh);

describe('crawl lifecycle', () => {
  it('refreshes the live summary while work remains, then terminalizes exactly once', async () => {
    const seed = await running();
    const done = await monitoredPage(seed, '/');
    const pending = await fixtures.analyzable(seed, '/pending');
    await reconcileAfterTask(db, settled(seed, done.taskId), cadence());
    const live = await crawlRow(seed.crawlId);
    expect(live.status).toBe('running');
    expect(live.score_summary).toMatchObject({
      analyzed_count: 1,
      aeo_measurement_state: 'limited_evidence',
    });
    expect(await snapshots(seed.crawlId)).toHaveLength(0);

    await db
      .updateTable('site_crawl_tasks')
      .set({ status: 'failed', error_code: 'task_failed' })
      .where('id', '=', pending.taskId)
      .execute();
    await reconcileAfterTask(db, settled(seed, pending.taskId), cadence());
    await reconcileCrawl(db, seed.workspaceId, seed.crawlId);
    expect(await crawlRow(seed.crawlId)).toMatchObject({
      status: 'partially_completed',
      partial_reason: 'analysis_incomplete',
      analysis_status: 'partially_completed',
      analyzed_url_count: 1,
      failed_url_count: 1,
    });
    expect(await snapshots(seed.crawlId)).toHaveLength(1);
    expect(await events(seed.crawlId, 'crawl.completed')).toHaveLength(1);
    expect((await tasksOf(seed.crawlId, 'change_intel')).map((task) => task.status)).toEqual([
      'queued',
    ]);
    expect(await tasksOf(seed.crawlId, 'link_metrics')).toHaveLength(1);
  });

  it('settles discovery without rebuilding a score only analyses can change', async () => {
    const seed = await running({ discovery_status: 'running' });
    const done = await monitoredPage(seed, '/');
    await fixtures.analyzable(seed, '/pending');
    const discover = await fixtures.task(seed, 'discover');
    await db
      .updateTable('site_crawl_tasks')
      .set({ status: 'succeeded' })
      .where('id', '=', discover)
      .execute();
    await reconcileAfterTask(db, settled(seed, discover), cadence());
    expect(await crawlRow(seed.crawlId)).toMatchObject({
      status: 'running',
      discovery_status: 'completed',
      score_summary: null,
    });
    await reconcileAfterTask(db, settled(seed, done.taskId), cadence());
    expect((await crawlRow(seed.crawlId)).score_summary).toMatchObject({ analyzed_count: 1 });
  });

  it('does not count a policy exclusion as an incomplete analysis', async () => {
    const seed = await running();
    await monitoredPage(seed, '/');
    const excluded = await fixtures.analyzable(seed, '/account');
    await db
      .updateTable('site_crawl_tasks')
      .set({ status: 'failed', error_code: 'url_admission_rejected' })
      .where('id', '=', excluded.taskId)
      .execute();
    await reconcileCrawl(db, seed.workspaceId, seed.crawlId);
    expect(await crawlRow(seed.crawlId)).toMatchObject({
      status: 'completed',
      partial_reason: '',
      failed_url_count: 0,
    });
  });

  it('hands analytics the crawl identity when no page was analyzed', async () => {
    const seed = await running({ analysis_status: 'pending' });
    await reconcileCrawl(db, seed.workspaceId, seed.crawlId);
    expect((await crawlRow(seed.crawlId)).status).toBe('completed');
    expect(await tasksOf(seed.crawlId, 'change_intel')).toHaveLength(0);
    const handoff = await db
      .selectFrom('analytics_tasks')
      .select(['task_kind', 'payload'])
      .where('project_id', '=', seed.projectId)
      .execute();
    expect(handoff).toContainEqual({
      task_kind: 'opportunity_refresh',
      payload: expect.objectContaining({ trigger_kind: 'site_crawl', trigger_id: seed.crawlId }),
    });
    expect(handoff).toContainEqual({ task_kind: 'ai_traffic_insights_refresh', payload: {} });
  });

  it('ignores a settled task named under another workspace', async () => {
    const seed = await running();
    const foreign = await running();
    const page = await monitoredPage(seed, '/');
    await reconcileAfterTask(
      db,
      { ...settled(seed, page.taskId), workspace_id: foreign.workspaceId },
      cadence(),
    );
    expect(await crawlRow(seed.crawlId)).toMatchObject({ status: 'running', score_summary: null });
  });

  it('fails the tasks of an overdue crawl and settles it on its evidence, sparing a young crawl', async () => {
    const overdue = await running({ started_at: LONG_AGO, created_at: LONG_AGO });
    await monitoredPage(overdue, '/');
    const wedged = await fixtures.analyzable(overdue, '/wedged');
    await db
      .updateTable('site_crawl_tasks')
      .set({
        status: 'running',
        lease_owner: 'live',
        lease_expires_at: new Date(Date.now() + 60_000),
      })
      .where('id', '=', wedged.taskId)
      .execute();
    const young = await running({ started_at: new Date() });
    const queued = await fixtures.task(young, 'analyze');
    await reconcileOverdue(db, { stalledSeconds: 0, overdueSeconds: 3600, batch: 50 });
    expect(
      (await tasksOf(overdue.crawlId, 'analyze')).find((task) => task.id === wedged.taskId),
    ).toMatchObject({ status: 'failed', error_code: 'crawl_overdue', lease_owner: null });
    expect((await crawlRow(overdue.crawlId)).status).toBe('partially_completed');
    expect((await crawlRow(young.crawlId)).status).toBe('running');
    expect(
      (await tasksOf(young.crawlId, 'analyze')).find((task) => task.id === queued)?.status,
    ).toBe('queued');
  });

  it('a drain over an empty queue still terminalizes a stalled crawl', async () => {
    const stalled = await running({ updated_at: LONG_AGO });
    const worker = new SiteHealthWorker(db, {
      settings: { ...siteWorkerSettings({}), concurrency: 1, poll: 0 },
    });
    // The shared test database holds other suites' due work; this drain sees none.
    vi.spyOn(worker.queue, 'claim').mockResolvedValue([]);
    expect(await worker.runUntilIdle(new AbortController().signal)).toBe(0);
    expect((await crawlRow(stalled.crawlId)).status).toBe('completed');
    expect(await snapshots(stalled.crawlId)).toHaveLength(1);
  });

  it('publishes a cancelled run once and leaves a cancel without evidence unpublished', async () => {
    const seed = await fixtures.crawl('cancelled');
    const page = await monitoredPage(seed, '/');
    const empty = await fixtures.crawl('cancelled');
    await publishCancelledCrawls(db, 50);
    await publishCancelledCrawls(db, 50);
    expect(await snapshots(seed.crawlId)).toHaveLength(1);
    const current = await db
      .selectFrom('site_page_analyses')
      .selectAll()
      .where('crawl_id', '=', seed.crawlId)
      .where('is_current', '=', true)
      .executeTakeFirstOrThrow();
    expect(current.supersedes_analysis_id).toBe(page.analysisId);
    expect(current.finalized_at).not.toBeNull();
    expect((await crawlRow(seed.crawlId)).score_summary).toMatchObject({
      analyzed_count: 1,
      selected_count: 1,
    });
    expect(await tasksOf(seed.crawlId, 'change_intel')).toHaveLength(1);
    expect(await snapshots(empty.crawlId)).toHaveLength(0);
    expect((await crawlRow(empty.crawlId)).score_summary).toBeNull();
  });
});
