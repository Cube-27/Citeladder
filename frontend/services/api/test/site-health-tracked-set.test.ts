import { afterAll, describe, expect, it, vi } from 'vitest';
import { fitTrackedSet } from '../src/site-health/admission-writes.ts';
import { candidate } from '../src/site-health/frontier.ts';
import { createCrawl } from '../src/site-health/planner.ts';
import { fillTrackedSet } from '../src/site-health/tracked-set.ts';
import { classifyUrlAdmission } from '../src/site-health/url-admission.ts';
import { asOwner, testConfig, testDatabase } from './support.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { FinalizeFixtures } from './site-health-finalize-fixtures.ts';
import type { Tenant } from './visibility-fixtures.ts';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const db = testDatabase(testConfig());
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

async function allow(tenant: Tenant, limit: number) {
  const account = await billingAccount(db, tenant.workspaceId);
  accounts.push(account);
  await grant(db, account, { key: 'monitored_urls', value: limit });
}
const sitemapCandidates = (urls: string[]) =>
  urls.map((url, index) => {
    const admission = classifyUrlAdmission(url);
    return candidate(admission, {
      url: admission.url!,
      hash: admission.hash,
      depth: 1,
      sourceKind: 'sitemap',
      parentPosition: 0,
      linkOrdinal: index,
    });
  });
async function create(tenant: Tenant, options: Record<string, unknown> = {}) {
  return db
    .transaction()
    .execute((trx) =>
      createCrawl(trx, tenant.workspaceId, { project_id: tenant.projectId, ...options }),
    );
}

describe('tracked-set fill', () => {
  it('fills tracked pages in share order, never re-picks one, and fits the set to the plan limit', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    await allow(tenant, 3);
    const crawl = await create(tenant);
    const fill = (paths: string[]) =>
      db.transaction().execute(async (trx) => {
        const items = sitemapCandidates(paths.map((path) => `https://example.test${path}`));
        return (await fillTrackedSet(trx, crawl, items)).map(({ item }) => item.url);
      });
    const fit = (limit: number) =>
      fitTrackedSet(db, { workspaceId: tenant.workspaceId, projectId: tenant.projectId }, limit, {
        releaseSample: true,
      });
    const tracked = async () =>
      (
        await db
          .selectFrom('monitored_site_urls as m')
          .innerJoin('site_urls as u', 'u.id', 'm.site_url_id')
          .select(['u.normalized_url', 'm.fill_order', 'm.active', 'm.deselected_at'])
          .where('m.project_id', '=', tenant.projectId)
          .orderBy('m.fill_order')
          .execute()
      ).map((row) => [
        row.normalized_url.slice('https://example.test'.length),
        row.fill_order,
        row.active,
        row.deselected_at !== null,
      ]);

    expect(await fill(['/blog/x', '/about', '/products/a'])).toEqual([
      'https://example.test/products/a',
      'https://example.test/blog/x',
    ]);
    await fit(2);
    expect(await tracked()).toEqual([
      ['/', 0, true, false],
      ['/products/a', 1, true, false],
      ['/blog/x', 2, false, true],
    ]);
    expect(await fill(['/about', '/blog/x'])).toEqual(['https://example.test/about']);
    await fit(3);
    expect(await tracked()).toEqual([
      ['/', 0, true, false],
      ['/products/a', 1, true, false],
      ['/blog/x', 2, true, false],
      ['/about', 3, false, true],
    ]);
  });

  it('shares the tracked allowance across page types so a dominant type cannot take it all', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    await allow(tenant, 61);
    const crawl = await create(tenant);
    const paths = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `https://example.test/${prefix}/${index}`);
    const items = sitemapCandidates([
      ...paths('store', 500),
      ...paths('products', 20),
      ...paths('blog', 10),
      ...paths('faq', 5),
    ]);
    const joined = await db.transaction().execute((trx) => fillTrackedSet(trx, crawl, items));
    const kinds = Map.groupBy(joined, ({ item }) => item.valueKind);
    expect(Object.fromEntries([...kinds].map(([kind, rows]) => [kind, rows.length]))).toEqual({
      product: 20,
      local: 25,
      article: 10,
      faq: 5,
    });
    expect(
      joined
        .slice(0, 4)
        .map(({ item }) => item.valueKind)
        .toSorted(),
    ).toEqual(['article', 'faq', 'local', 'product']);
  });

  it('fills a full sitemap’s worth of tracked pages past the bind-parameter limit', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    await allow(tenant, 5001);
    const crawl = await create(tenant);
    const items = sitemapCandidates(
      Array.from({ length: 5000 }, (_, index) => `https://example.test/products/p${index}`),
    );
    const joined = await db.transaction().execute((trx) => fillTrackedSet(trx, crawl, items));
    expect(joined).toHaveLength(5000);
    const active = await db
      .selectFrom('monitored_site_urls')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('project_id', '=', tenant.projectId)
      .where('active', '=', true)
      .executeTakeFirstOrThrow();
    expect(Number(active.count)).toBe(5001);
  });
});
