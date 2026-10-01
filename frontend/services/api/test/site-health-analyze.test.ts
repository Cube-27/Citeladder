import { afterAll, describe, expect, it } from 'vitest';

import { policy } from '../src/config.ts';
import { record } from '../src/db/json.ts';
import { FetchError, type FetchedPage, type FetchOptions } from '../src/projects/safe-fetch.ts';
import { analyzeSettings } from '../src/site-health/analyze-task.ts';
import {
  hardExcluded,
  isBotBlock,
  SitePageFetcher,
  siteFetchSettings,
} from '../src/site-health/page-fetch.ts';
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

const codes = policy.site_health.page_analysis.acquisition.error_codes;
const workerSettings = {
  ...siteWorkerSettings({}),
  concurrency: 1,
  retryBase: 0,
  retryMax: 0,
  retryJitter: 0,
};
const fetchSettings = siteFetchSettings({
  SITE_HEALTH_PER_HOST_DELAY_SECONDS: '0',
  SITE_HEALTH_DEFAULT_CRAWL_DELAY_SECONDS: '0',
});
const RICH =
  "<html lang='en'><head><title>Rich page about widgets</title><meta name='description' content='Widgets.'></head>" +
  '<body><main><h1>Widgets</h1><p>Widgets are useful tools for small workshops.</p></main></body></html>';

type Served = {
  status?: number;
  body?: string;
  redirect?: string;
  contentType?: string;
  onFetch?: () => Promise<void>;
};
/**
 * A recorded site behind the real acquirer: robots and pacing run through the
 * gate, every hop is authorized, and each call is reported like the transport does.
 */
function site(pages: Record<string, Served>, requests: string[] = []) {
  const fetcher = async (value: string, options: FetchOptions): Promise<FetchedPage> => {
    let url = new URL(value);
    for (let hop = 0; hop <= options.redirects; hop++) {
      await options.authorize?.(url);
      const target = url;
      const served = pages[target.pathname];
      const send = async () => {
        requests.push(target.pathname);
        await served?.onFetch?.();
        const status = served?.status ?? (served ? 200 : 404);
        const body = Buffer.from(served?.body ?? '');
        options.onCall?.({
          url: target.href,
          status,
          error: null,
          wireBytes: body.length,
          decodedBytes: body.length,
          ttfbMs: 1,
          latencyMs: 1,
        });
        return { status, body, redirect: served?.redirect };
      };
      const response = options.gate
        ? await options.gate(target, send, AbortSignal.timeout(5000))
        : await send();
      if (!response.redirect)
        return {
          url: target.href,
          status: response.status,
          contentType: served?.contentType ?? 'text/html',
          body: response.body,
        };
      url = new URL(response.redirect, target);
    }
    throw new FetchError('redirect_limit');
  };
  return new SitePageFetcher(db, fetcher, fetchSettings);
}
/** Lease exactly these tasks to one worker and execute them, as its claim would. */
async function analyze(fetcher: SitePageFetcher, ...taskIds: string[]) {
  const worker = new SiteHealthWorker(db, {
    owner: 'analyze-test',
    settings: workerSettings,
    fetcher,
  });
  for (const id of taskIds) await worker.execute(await lease(id, worker.owner));
}

async function running(values: Record<string, unknown> = {}) {
  const seed = await fixtures.crawl('running');
  await db
    .updateTable('site_crawls')
    .set({ completed_at: null, analysis_status: 'running', ...values })
    .where('id', '=', seed.crawlId)
    .execute();
  return seed;
}
const task = (id: string) =>
  db.selectFrom('site_crawl_tasks').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const crawl = (seed: SiteSeed) =>
  db.selectFrom('site_crawls').selectAll().where('id', '=', seed.crawlId).executeTakeFirstOrThrow();
const analyses = (seed: SiteSeed, siteUrlId: string) =>
  db
    .selectFrom('site_page_analyses')
    .selectAll()
    .where('crawl_id', '=', seed.crawlId)
    .where('site_url_id', '=', siteUrlId)
    .orderBy('created_at')
    .execute();
const attempts = (taskId: string) =>
  db
    .selectFrom('site_fetch_attempts')
    .selectAll()
    .where('task_id', '=', taskId)
    .orderBy('request_ordinal')
    .execute();

describe('analyze acquisition', () => {
  it('acquires, analyzes and settles the page with its evidence in one commit', async () => {
    const seed = await running({ status: 'queued', started_at: null });
    const page = await fixtures.analyzable(seed, '/rich');
    const requests: string[] = [];
    await analyze(site({ '/rich': { body: RICH } }, requests), page.taskId);

    const settled = await task(page.taskId);
    expect(settled).toMatchObject({
      status: 'succeeded',
      attempt_count: 1,
      classification_expected: true,
      error_code: '',
    });
    expect(requests).toEqual(['/robots.txt', '/rich']);
    const artifact = await db
      .selectFrom('site_fetch_artifacts')
      .selectAll()
      .where('id', '=', settled.result_artifact_id!)
      .executeTakeFirstOrThrow();
    expect(artifact).toMatchObject({
      fetch_purpose: 'analyze',
      status_code: 200,
      task_id: page.taskId,
    });
    expect(record(artifact.normalized_facts).title).toBe('Rich page about widgets');
    expect(await attempts(page.taskId)).toEqual([
      expect.objectContaining({
        request_ordinal: 0,
        outcome: 'success',
        status_code: 200,
        artifact_id: artifact.id,
      }),
    ]);

    const [analysis] = await analyses(seed, page.siteUrlId);
    expect(analysis).toMatchObject({
      artifact_id: artifact.id,
      status: 'completed',
      is_current: true,
      finalized_at: null,
      analyzer_version: policy.site_health.versions.analyzer,
    });
    expect(analysis!.web_fundamentals_score).not.toBeNull();
    const evaluations = await db
      .selectFrom('site_rule_evaluations')
      .select(['id', 'rule_id', 'outcome'])
      .where('analysis_id', '=', analysis!.id)
      .execute();
    expect(new Set(evaluations.map((row) => row.id))).toEqual(
      new Set(analysis!.source_evaluation_ids),
    );
    expect(evaluations.find((row) => row.rule_id === 'technical.canonical_present')!.outcome).toBe(
      'missing',
    );
    const issues = await db
      .selectFrom('site_issues')
      .select('rule_id')
      .where('analysis_id', '=', analysis!.id)
      .execute();
    expect(issues.map((row) => row.rule_id)).toContain('technical.canonical_present');

    const after = await crawl(seed);
    expect(after).toMatchObject({ status: 'running', analyzed_url_count: 1 });
    expect(after.started_at).not.toBeNull();
    const url = await db
      .selectFrom('site_urls')
      .selectAll()
      .where('id', '=', page.siteUrlId)
      .executeTakeFirstOrThrow();
    expect(url).toMatchObject({
      latest_title: 'Rich page about widgets',
      discovery_status: 'completed',
    });
  });

  it('reuses the discover artifact without refetching, and a rerun supersedes the current analysis', async () => {
    const seed = await running();
    const page = await fixtures.analyzable(seed, '/');
    const facts = {
      has_html: true,
      title: 'Home',
      delivery: { final_url: page.url, status_code: 200 },
    };
    const discovered = await fixtures.discover(seed, page.hash, 'succeeded', facts);
    const requests: string[] = [];
    const fetcher = site({}, requests);
    await analyze(fetcher, page.taskId);
    expect(await task(page.taskId)).toMatchObject({
      status: 'succeeded',
      result_artifact_id: discovered.artifactId,
      classification_expected: true,
    });
    expect(requests).toEqual([]);
    expect(await attempts(page.taskId)).toEqual([]);

    await analyze(fetcher, page.taskId);
    const rows = await analyses(seed, page.siteUrlId);
    expect(rows.map((row) => [row.artifact_id, row.is_current])).toEqual([
      [discovered.artifactId, false],
      [discovered.artifactId, true],
    ]);
    expect((await crawl(seed)).analyzed_url_count).toBe(2);
  });

  it('waits for in-flight prerequisites without spending an attempt, then acquires past the bound', async () => {
    const seed = await running({ site_facts: null });
    const root = await fixtures.analyzable(seed, '/');
    await fixtures.discover(seed, root.hash, 'running', null);
    const requests: string[] = [];
    const fetcher = site({ '/': { body: RICH } }, requests);
    await analyze(fetcher, root.taskId);
    const deferred = await task(root.taskId);
    expect(deferred).toMatchObject({ status: 'queued', attempt_count: 0, lease_owner: null });
    expect(deferred.available_at.getTime()).toBeGreaterThan(Date.now());
    expect(requests).toEqual([]);

    // The root also waits for site setup, whose facts only its analysis reads.
    const other = await running({ site_facts: null });
    const otherRoot = await fixtures.analyzable(other, '/');
    await fixtures.task(other, 'site_setup');
    await analyze(fetcher, otherRoot.taskId);
    expect((await task(otherRoot.taskId)).status).toBe('queued');

    const old = new Date(Date.now() - (analyzeSettings({}).dependencyMaxWait + 60) * 1000);
    await db
      .updateTable('site_crawl_tasks')
      .set({ created_at: old, available_at: new Date() })
      .where('id', '=', root.taskId)
      .execute();
    await analyze(fetcher, root.taskId);
    expect((await task(root.taskId)).status).toBe('succeeded');
    expect(requests).toEqual(['/robots.txt', '/']);
  });

  it('evaluates site-root rules on the root analysis only and never persists the injected site facts', async () => {
    const siteFacts = {
      robots: {
        fetched: true,
        status: 'fetched',
        status_code: 200,
        url: 'https://example.test/robots.txt',
      },
    };
    const seed = await running({ site_facts: JSON.stringify(siteFacts) });
    const root = await fixtures.analyzable(seed, '/');
    const child = await fixtures.analyzable(seed, '/a');
    const fetcher = site({ '/': { body: RICH }, '/a': { body: RICH } });
    await analyze(fetcher, root.taskId, child.taskId);
    const robotsRule = async (siteUrlId: string) => {
      const [analysis] = await analyses(seed, siteUrlId);
      return db
        .selectFrom('site_rule_evaluations')
        .select('outcome')
        .where('analysis_id', '=', analysis!.id)
        .where('rule_id', '=', 'technical.robots_txt_present')
        .executeTakeFirstOrThrow();
    };
    expect((await robotsRule(root.siteUrlId)).outcome).toBe('satisfied');
    expect((await robotsRule(child.siteUrlId)).outcome).toBe('not_applicable');
    const artifact = await db
      .selectFrom('site_fetch_artifacts')
      .select('normalized_facts')
      .where('task_id', '=', root.taskId)
      .executeTakeFirstOrThrow();
    expect(record(artifact.normalized_facts)).not.toHaveProperty('site');
  });
});

describe('analyze failures', () => {
  it.each([
    [
      'a challenge interstitial',
      {
        status: 403,
        body: '<html><title>Just a moment...</title><div id="challenge-platform"></div></html>',
      },
      'failed',
      codes.bot_blocked,
    ],
    ['a plain 404', { status: 404, body: 'gone' }, 'failed', codes.http_4xx],
    ['a 429', { status: 429, body: '' }, 'retry_wait', codes.http_4xx],
    ['a 503', { status: 503, body: '' }, 'retry_wait', codes.http_5xx],
  ])(
    'settles %s without analysis and keeps the call as a failed attempt',
    async (_label, served, status, code) => {
      const seed = await running();
      const page = await fixtures.analyzable(seed, '/page');
      await analyze(site({ '/page': served }), page.taskId);
      const settled = await task(page.taskId);
      expect(settled).toMatchObject({
        status,
        error_code: code,
        attempt_count: 1,
        result_artifact_id: null,
      });
      expect(await attempts(page.taskId)).toEqual([
        expect.objectContaining({
          outcome: policy.site_health.reads.fetch_attempt_error_outcome,
          status_code: served.status,
          artifact_id: null,
        }),
      ]);
      expect(await analyses(seed, page.siteUrlId)).toEqual([]);
    },
  );

  it('honors robots before any page request and records one diagnostic attempt', async () => {
    const seed = await running();
    const page = await fixtures.analyzable(seed, '/private');
    const requests: string[] = [];
    await analyze(
      site(
        { '/robots.txt': { body: 'User-agent: *\nDisallow: /\n', contentType: 'text/plain' } },
        requests,
      ),
      page.taskId,
    );
    expect(await task(page.taskId)).toMatchObject({
      status: 'failed',
      error_code: codes.robots_denied,
    });
    expect(requests).toEqual(['/robots.txt']);
    expect(await attempts(page.taskId)).toEqual([
      expect.objectContaining({ error_code: codes.robots_denied, status_code: null }),
    ]);
  });

  it('never follows a redirect into a hard-excluded endpoint', async () => {
    const seed = await running();
    const page = await fixtures.analyzable(seed, '/promo');
    const requests: string[] = [];
    await analyze(site({ '/promo': { status: 302, redirect: '/cart' } }, requests), page.taskId);
    expect(await task(page.taskId)).toMatchObject({
      status: 'failed',
      error_code: codes.url_admission_rejected,
    });
    expect(requests).toEqual(['/robots.txt', '/promo']);
  });

  it('keeps a bodyless success out of the classification cohort', async () => {
    const seed = await running();
    const page = await fixtures.analyzable(seed, '/empty');
    await analyze(site({ '/empty': { status: 204, body: '' } }), page.taskId);
    expect(await task(page.taskId)).toMatchObject({
      status: 'succeeded',
      classification_expected: false,
    });
  });
});

async function lease(taskId: string, owner: string) {
  return db
    .updateTable('site_crawl_tasks')
    .set({ status: 'leased', lease_owner: owner, lease_expires_at: new Date(Date.now() + 60_000) })
    .where('id', '=', taskId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

describe('analyze guards', () => {
  it('cancels before any I/O when the entitlement no longer covers a user selection, but not a free sample', async () => {
    const seed = await running();
    const user = await fixtures.analyzable(seed, '/user', { monitoredLimit: 0 });
    const sample = await fixtures.analyzable(seed, '/sample', {
      monitoredLimit: 0,
      source: 'free_sample',
    });
    const requests: string[] = [];
    await analyze(site({ '/sample': { body: RICH } }, requests), user.taskId, sample.taskId);
    expect(await task(user.taskId)).toMatchObject({ status: 'cancelled', error_code: 'cancelled' });
    expect((await task(sample.taskId)).status).toBe('succeeded');
    expect(requests).toEqual(['/robots.txt', '/sample']);
  });

  it.each([
    [
      'membership removed',
      (seed: SiteSeed, siteUrlId: string) =>
        db
          .updateTable('monitored_site_urls')
          .set({ active: false })
          .where('site_url_id', '=', siteUrlId)
          .execute(),
      'cancelled',
    ],
    [
      'lease lost',
      (_seed: SiteSeed, _siteUrlId: string, taskId: string) =>
        db
          .updateTable('site_crawl_tasks')
          .set({ lease_owner: 'another-worker' })
          .where('id', '=', taskId)
          .execute(),
      'running',
    ],
    [
      'crawl cancelled',
      (seed: SiteSeed) =>
        db
          .updateTable('site_crawls')
          .set({ status: 'cancelled' })
          .where('id', '=', seed.crawlId)
          .execute(),
      'cancelled',
    ],
  ])('writes no evidence when the %s during the fetch', async (_label, interrupt, status) => {
    const seed = await running();
    const page = await fixtures.analyzable(seed, '/page');
    const fetcher = site({
      '/page': {
        body: RICH,
        onFetch: async () => void (await interrupt(seed, page.siteUrlId, page.taskId)),
      },
    });
    await analyze(fetcher, page.taskId);
    expect(await task(page.taskId)).toMatchObject({ status, result_artifact_id: null });
    expect(await attempts(page.taskId)).toEqual([]);
    expect(await analyses(seed, page.siteUrlId)).toEqual([]);
    expect((await crawl(seed)).analyzed_url_count).toBe(0);
  });
});

describe('page fetch policy', () => {
  const page = (status: number, body: string): FetchedPage => ({
    url: 'https://example.test/',
    status,
    contentType: 'text/html',
    body: Buffer.from(body),
  });
  it('treats a challenge marker as a block unless the page carries real content', () => {
    const marker = '<div id="challenge-platform"></div>';
    expect(isBotBlock(page(403, `<html>${marker}</html>`))).toBe(true);
    expect(isBotBlock(page(200, `<html>${marker}</html>`))).toBe(true);
    expect(isBotBlock(page(200, `<html>${marker}<main><h1>Widgets</h1></main></html>`))).toBe(
      false,
    );
    expect(isBotBlock(page(200, '<html><main><h1>Widgets</h1></main></html>'))).toBe(false);
  });
  it('excludes non-content endpoints and tracking variants but not ordinary pages', () => {
    expect(hardExcluded(new URL('https://example.test/cart'))).toBe(true);
    expect(hardExcluded(new URL('https://example.test/products/widget?utm_source=x'))).toBe(true);
    expect(hardExcluded(new URL('https://example.test/assets/site.css'))).toBe(true);
    expect(hardExcluded(new URL('https://example.test/products/widget'))).toBe(false);
  });
});
