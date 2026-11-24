import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  crawlBudgetsSchema,
  rerunPageResponseSchema,
  siteCrawlSchema,
} from '@citeladder/contracts/site-health';
import { budget, spendBudget } from '../src/abuse/usage.ts';
import { createApp } from '../src/app.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { controlHarness } from './site-health-control-support.ts';
import type { Tenant } from './visibility-fixtures.ts';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
const harness = controlHarness(db);
const { fixtures, allow } = harness;
afterAll(async () => {
  await harness.cleanup();
  await db.destroy();
});

async function request(tenant: Tenant, path: string, method = 'GET', body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: {
      cookie: `${config.session.cookieName}=${await sessionToken({ sub: tenant.userId, ver: 0 })}`,
      'x-workspace-id': tenant.workspaceId,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function used(tenant: Tenant) {
  const response = await request(tenant, `/projects/${tenant.projectId}/crawl-budgets`);
  const budgets = crawlBudgetsSchema.parse(await response.json());
  return { full: budgets.full_crawls.used, page: budgets.page_crawls.used };
}

async function startCrawl(tenant: Tenant) {
  const response = await request(tenant, '/site-crawls', 'POST', { project_id: tenant.projectId });
  expect(response.status, await response.clone().text()).toBe(201);
  return siteCrawlSchema.parse(await response.json()).id;
}

describe('Site Health crawl budgets', () => {
  it('keeps full crawls and single-page crawls on separate monthly budgets', async () => {
    const seed = await fixtures.crawl();
    await allow(seed, 1, 5);
    const page = await fixtures.page(seed, '/a', {}, { observed: true });
    await fixtures.monitor(seed, [page.id]);
    await db
      .updateTable('projects')
      .set({ website_url: '' })
      .where('id', '=', seed.projectId)
      .execute();
    const full = budget('site_health_full_crawl', {});
    await spendBudget(db, full, seed.workspaceId, { amount: full.limit });

    const refused = await request(seed, '/site-crawls', 'POST', { project_id: seed.projectId });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({
      error: { code: 'site_health_crawl_budget_exhausted' },
    });
    const rerun = await request(
      seed,
      `/site-crawls/${seed.crawlId}/pages/${page.id}/rerun`,
      'POST',
    );
    expect(rerun.status, await rerun.clone().text()).toBe(202);
    expect(await used(seed)).toEqual({ full: full.limit, page: 1 });

    const { crawl_id: rerunId } = rerunPageResponseSchema.parse(await rerun.json());
    expect((await request(seed, `/site-crawls/${rerunId}/cancel`, 'POST')).status).toBe(200);
    expect(await used(seed)).toEqual({ full: full.limit, page: 0 });
    const pages = budget('site_health_page_crawl', {});
    await spendBudget(db, pages, seed.workspaceId, { amount: pages.limit });
    const pageRefused = await request(
      seed,
      `/site-crawls/${seed.crawlId}/pages/${page.id}/rerun`,
      'POST',
    );
    expect(pageRefused.status).toBe(429);
    expect(await pageRefused.json()).toMatchObject({
      error: { code: 'site_health_crawl_budget_exhausted' },
    });
  });

  it('gives a start back when its crawl is cancelled before any page was fetched, not after', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    await allow(tenant, 2);

    const unfetched = await startCrawl(tenant);
    expect(await used(tenant)).toEqual({ full: 1, page: 0 });
    expect((await request(tenant, `/site-crawls/${unfetched}/cancel`, 'POST')).status).toBe(200);
    expect(await used(tenant)).toEqual({ full: 0, page: 0 });

    const fetched = await startCrawl(tenant);
    const marked = await db
      .updateTable('site_crawl_tasks')
      .set({ status: 'succeeded' })
      .where('crawl_id', '=', fetched)
      .where('task_kind', '=', 'analyze')
      .executeTakeFirstOrThrow();
    expect(marked.numUpdatedRows).toBe(1n);
    expect((await request(tenant, `/site-crawls/${fetched}/cancel`, 'POST')).status).toBe(200);
    expect(await used(tenant)).toEqual({ full: 1, page: 0 });
  });
});
