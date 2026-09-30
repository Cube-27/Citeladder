import { randomUUID } from 'node:crypto';

import { afterAll, expect, it, vi } from 'vitest';

import { policy } from '../src/config.ts';
import { projectCreate } from '../src/projects/inputs.ts';
import { refreshLogos } from '../src/projects/logo-refresh.ts';
import { createProject, updateProject } from '../src/projects/service.ts';
import type { WebsiteFetcher } from '../src/projects/safe-fetch.ts';
import { billingAccount } from './prompt-fixtures.ts';
import { Fixtures, testDatabase } from './support.ts';

const db = testDatabase();
const fixtures = new Fixtures(db);
const domains: string[] = [];
afterAll(async () => {
  await fixtures.cleanup();
  if (domains.length)
    await db.deleteFrom('brand_logo_assets').where('domain', 'in', domains).execute();
  await db.destroy();
});
async function tenant() {
  const userId = await fixtures.user();
  const workspaceId = await fixtures.ownedWorkspace(userId);
  await billingAccount(db, workspaceId);
  const domain = `logo-${randomUUID()}.com`;
  domains.push(domain);
  const project = await createProject(
    db,
    workspaceId,
    userId,
    projectCreate.parse({ name: 'Logo', brand_name: 'Logo', website_url: domain }),
  );
  return { workspaceId, projectId: project.id, domain };
}
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
it('attaches ready raster assets, reuses fresh cache and retains stale success after failed refresh', async () => {
  const t = await tenant();
  const fetcher = vi.fn<WebsiteFetcher>(async (url) =>
    url.endsWith('favicon.ico')
      ? { url, status: 200, contentType: 'image/png', body: png }
      : {
          url,
          status: 200,
          contentType: 'text/html',
          body: Buffer.from('<p>No declared icon</p>'),
        },
  );
  expect((await refreshLogos(db, t, fetcher)).brand.logo_url).toContain('/logo');
  const calls = fetcher.mock.calls.length;
  await refreshLogos(db, t, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(calls);
  await db
    .updateTable('brand_logo_assets')
    .set({
      fetched_at: new Date(Date.now() - (policy.brand_logos.success_cache_seconds + 1) * 1000),
    })
    .where('domain', '=', t.domain)
    .execute();
  const failed = vi.fn<WebsiteFetcher>(async () => {
    throw new Error('recorded unavailable');
  });
  expect((await refreshLogos(db, t, failed)).brand.logo_url).toContain('/logo');
  expect(
    await db
      .selectFrom('brand_logo_assets')
      .select(['status', 'image_data'])
      .where('domain', '=', t.domain)
      .executeTakeFirstOrThrow(),
  ).toMatchObject({ status: 'ready', image_data: png });
});
it('negative caches failures and refuses to attach a result after identity changes', async () => {
  const t = await tenant();
  const failed = vi.fn<WebsiteFetcher>(async () => {
    throw new Error('recorded unavailable');
  });
  await refreshLogos(db, t, failed);
  const count = failed.mock.calls.length;
  await refreshLogos(db, t, failed);
  expect(failed).toHaveBeenCalledTimes(count);
  await db.deleteFrom('brand_logo_assets').where('domain', '=', t.domain).execute();
  const changed: WebsiteFetcher = async (url) => {
    await updateProject(db, t, { website_url: 'different.example.com' });
    return { url, status: 200, contentType: 'image/png', body: png };
  };
  expect((await refreshLogos(db, t, changed)).brand.logo_url).toBeNull();
});
