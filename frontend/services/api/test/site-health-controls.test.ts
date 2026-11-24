import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { setTimeout } from 'node:timers/promises';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  siteCrawlListPageSchema,
  siteCrawlSchema,
  rerunPageResponseSchema,
} from '@citeladder/contracts/site-health';
import { createApp } from '../src/app.ts';
import { policy } from '../src/config.ts';
import { cancelCrawl } from '../src/site-health/controls.ts';
import { createCrawl } from '../src/site-health/planner.ts';
import { controls } from '../src/site-health/planner-policy.ts';
import { rerunPage } from '../src/site-health/selection.ts';
import { publishCancelledCrawls, reconcileCrawl } from '../src/site-health/lifecycle.ts';
import { record } from '../src/db/json.ts';
import { revokeBundle } from '../src/entitlements/grants.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { asOwner, sessionToken, testConfig, testDatabase } from './support.ts';
import { FinalizeFixtures, type SiteSeed } from './site-health-finalize-fixtures.ts';
import type { Tenant } from './visibility-fixtures.ts';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
const fixtures = new FinalizeFixtures(db);
const accounts: string[] = [];
afterEach(() => vi.unstubAllEnvs());
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

async function request(tenant: Tenant, path: string, method = 'GET', body?: unknown, server = app) {
  return server.request(`/api/v1${path}`, {
    method,
    headers: {
      cookie: `${config.session.cookieName}=${await sessionToken({ sub: tenant.userId, ver: 0 })}`,
      'x-workspace-id': tenant.workspaceId,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function allow(tenant: Tenant, limit: number, fetches?: number) {
  const account = await billingAccount(db, tenant.workspaceId);
  accounts.push(account);
  await grant(db, account, { key: 'monitored_urls', value: limit });
  if (fetches !== undefined)
    await grant(db, account, { key: 'site_health_page_fetches_per_period', value: fetches });
  return account;
}
const otherProject = (seed: SiteSeed) => fixtures.otherProject(seed);
async function create(tenant: Tenant, options: Record<string, unknown> = {}) {
  return db
    .transaction()
    .execute((trx) =>
      createCrawl(trx, tenant.workspaceId, { project_id: tenant.projectId, ...options }),
    );
}

describe('crawl control admission', () => {
  it('denies corrupt grants with a non-retryable entitlement error for creation and rerun', async () => {
    const seed = await fixtures.crawl();
    const account = await allow(seed, 1, 2);
    const page = await fixtures.page(seed, '/a', {}, { observed: true });
    await fixtures.monitor(seed, [page.id]);
    await grant(db, account, { key: 'commerce', value: 2 });
    for (const [path, body] of [
      ['/site-crawls', { project_id: seed.projectId }],
      [`/site-crawls/${seed.crawlId}/pages/${page.id}/rerun`, undefined],
    ] as const) {
      const response = await request(seed, path, 'POST', body);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: 'access_unresolved', retryable: false },
      });
    }
  });
  it('serializes two concurrent creates and seeds one setup and the tracked root’s analysis', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    await allow(tenant, 2);
    const outcomes = await Promise.allSettled([create(tenant), create(tenant)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toMatchObject({
      status: 409,
      code: 'crawl_already_active',
    });
    const crawl = await db
      .selectFrom('site_crawls')
      .selectAll()
      .where('project_id', '=', tenant.projectId)
      .executeTakeFirstOrThrow();
    const tasks = await db
      .selectFrom('site_crawl_tasks')
      .selectAll()
      .where('crawl_id', '=', crawl.id)
      .execute();
    expect(tasks.map((task) => [task.task_kind, task.requested_url]).sort()).toEqual([
      ['analyze', 'https://example.test/'],
      ['site_setup', 'https://example.test/'],
    ]);
    expect(crawl.discovery_status).toBe('pending');
    expect(record(crawl.configuration)).toMatchObject({
      monitored_url_limit: 2,
      automatic_monitor_limit: 2,
      requested_page_limit: 2,
      page_profile_rule_version: policy.site_health.versions.rules,
    });
    const tracked = await db
      .selectFrom('monitored_site_urls as m')
      .innerJoin('site_urls as u', 'u.id', 'm.site_url_id')
      .select(['u.normalized_url', 'm.fill_order', 'm.active'])
      .where('m.project_id', '=', tenant.projectId)
      .execute();
    expect(tracked).toEqual([
      { normalized_url: 'https://example.test/', fill_order: 0, active: true },
    ]);
  });

  it('reserves one shared fetch allowance under concurrent creates and settles unused units once', async () => {
    const first = await fixtures.crawl();
    const second = await otherProject(first);
    await allow(first, 4, 3);
    const outcomes = await Promise.allSettled([create(first), create(second)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const success = outcomes.find((outcome) => outcome.status === 'fulfilled');
    if (success?.status !== 'fulfilled') throw new Error('No admitted crawl');
    const failure = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toMatchObject({
      status: 409,
      code: 'site_health_fetches_exhausted',
    });
    const crawl = success.value;
    expect(record(crawl.configuration).requested_page_limit).toBe(3);
    const task = await db
      .selectFrom('site_crawl_tasks')
      .select('id')
      .where('crawl_id', '=', crawl.id)
      .where('task_kind', '=', 'analyze')
      .executeTakeFirstOrThrow();
    await db
      .updateTable('site_crawl_tasks')
      .set({ status: 'succeeded' })
      .where('id', '=', task.id)
      .execute();
    await cancelCrawl(db, first.workspaceId, crawl.id);
    await cancelCrawl(db, first.workspaceId, crawl.id);
    const entries = await db
      .selectFrom('consumable_ledger')
      .select(['entry_kind', 'units'])
      .where('site_crawl_id', '=', crawl.id)
      .execute();
    expect(
      entries.filter((entry) => entry.entry_kind === 'debit').map((entry) => entry.units),
    ).toEqual([1]);
    expect(
      entries
        .filter((entry) => entry.entry_kind === 'reservation')
        .reduce((sum, row) => sum + row.units, 0),
    ).toBe(3);
    expect(
      entries
        .filter((entry) => entry.entry_kind === 'release')
        .reduce((sum, row) => sum + row.units, 0),
    ).toBe(3);
  });

  it('crawls an operator_controls workspace past an exhausted fetch allowance, unreserved, and no other', async () => {
    const seed = await fixtures.crawl();
    const other = await otherProject(seed);
    const outsiderSeed = await fixtures.crawl();
    const outsider = await otherProject(outsiderSeed);
    const operatorAccount = await allow(seed, 4, 0);
    await allow(outsiderSeed, 4, 0);
    await expect(create(other)).rejects.toMatchObject({ code: 'site_health_fetches_exhausted' });
    vi.stubEnv('DEV_LOGIN_EMAIL', `dev-${seed.userId}@example.test`);
    vi.stubEnv('DEV_LOGIN_PASSWORD', 'test-only-development-password');
    await db
      .updateTable('users')
      .set({ email: `dev-${seed.userId}@example.test`, role: 'admin' })
      .where('id', '=', seed.userId)
      .execute();
    await expect(create(other)).rejects.toMatchObject({ code: 'site_health_fetches_exhausted' });
    await grant(db, operatorAccount, { key: 'operator_controls', value: 1 });
    await expect(create(outsider)).rejects.toMatchObject({
      code: 'site_health_fetches_exhausted',
    });
    const crawl = await create(other);
    expect(crawl.discovery_requested_count).toBe(100);
    expect(
      await db
        .selectFrom('consumable_ledger')
        .select('entry_kind')
        .where('site_crawl_id', '=', crawl.id)
        .execute(),
    ).toEqual([]);
  });

  it.each([
    { input_mode: 'exact_urls', seed_urls: ['https://example.test/a'] },
    { include_globs: ['*/docs/*'] },
    { exclude_globs: ['*/private/*'] },
    { page_kinds: ['article'] },
    { requested_page_limit: 3 },
    { discovery_count: 3 },
  ])('refuses the retired crawl option %j and starts no crawl', async (option) => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    const response = await request(tenant, '/site-crawls', 'POST', {
      project_id: tenant.projectId,
      ...option,
    });
    expect(response.status).toBe(422);
    expect(
      await db
        .selectFrom('site_crawls')
        .select('id')
        .where('project_id', '=', tenant.projectId)
        .execute(),
    ).toHaveLength(0);
  });

  it('sizes a full crawl to the plan’s tracked pages and its HTML walk to the discovery cap', async () => {
    vi.stubEnv('SITE_HEALTH_AUTOMATIC_PAGE_LIMIT', '7');
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    await allow(tenant, 50);
    const crawl = await create(tenant);
    expect(record(crawl.configuration).requested_page_limit).toBe(50);
    expect(crawl.discovery_requested_count).toBe(50);
  });

  it('meters a crawl once a concurrent operator_controls revocation commits', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    const accountId = await allow(tenant, 4, 0);
    const grantId = await grant(db, accountId, { key: 'operator_controls', value: 1 });
    let admission: Promise<unknown> | undefined;
    const revocation = await db.startTransaction().execute();
    try {
      await revokeBundle(revocation, {
        workspaceId: tenant.workspaceId,
        accountId,
        grantIds: [grantId],
        key: randomUUID(),
        reason: 'operator controls withdrawn',
        actorKind: 'operator',
        actorId: null,
        at: new Date(),
      });
      const blocker = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(
        revocation,
      );
      admission = create(tenant).catch((error: unknown) => error);
      await vi.waitFor(
        async () => {
          const blocked = await sql<{ waiting: boolean }>`select exists (
            select 1 from pg_stat_activity where ${blocker.rows[0]!.pid} = any(pg_blocking_pids(pid))
          ) as waiting`.execute(db);
          expect(blocked.rows[0]!.waiting).toBe(true);
        },
        { timeout: 5000, interval: 20 },
      );
      await revocation.commit().execute();
      expect(await admission).toMatchObject({ status: 409, code: 'site_health_fetches_exhausted' });
    } finally {
      if (!revocation.isCommitted) await revocation.rollback().execute();
      await admission;
    }
  });

  it('re-seeds only active monitored URLs and freezes full inventory lineage across a sample crawl', async () => {
    const seed = await fixtures.crawl();
    await allow(seed, 3);
    const a = await fixtures.page(seed, '/a', {});
    const b = await fixtures.page(seed, '/b', {});
    const c = await fixtures.page(seed, '/c', {});
    await fixtures.monitor(seed, [a.id, b.id, c.id]);
    await fixtures.monitor(seed, [a.id, c.id]);
    const full = await create(seed);
    const tasks = await db
      .selectFrom('site_crawl_tasks')
      .select(['site_url_id', 'task_kind'])
      .where('crawl_id', '=', full.id)
      .execute();
    const root = await db
      .selectFrom('site_urls')
      .select('id')
      .where('project_id', '=', seed.projectId)
      .where('normalized_url', '=', seed.root)
      .executeTakeFirstOrThrow();
    expect(
      tasks
        .filter((task) => task.task_kind === 'analyze')
        .map((task) => task.site_url_id)
        .sort(),
    ).toEqual([a.id, c.id, root.id].sort());
    expect(
      (
        await db
          .selectFrom('site_url_observations')
          .select('site_url_id')
          .where('crawl_id', '=', full.id)
          .execute()
      )
        .map((row) => row.site_url_id)
        .sort(),
    ).toEqual([a.id, c.id, root.id].sort());
    expect(record(full.configuration).inventory_source_crawl_ids).toEqual([seed.crawlId]);
    await cancelCrawl(db, seed.workspaceId, full.id);
    await fixtures.sibling(seed, { sample_mode: true, created_at: new Date(Date.now() + 1000) });
    const next = await create(seed);
    expect(record(next.configuration).inventory_source_crawl_ids).toEqual([full.id, seed.crawlId]);
  });

  it('analyzes a monitored set that exactly fills the page limit, the root counted once', async () => {
    const seed = await fixtures.crawl();
    await allow(seed, 3, 3);
    const root = await fixtures.page(seed, '/', {});
    const a = await fixtures.page(seed, '/a', {});
    const z = await fixtures.page(seed, '/z', {});
    await fixtures.monitor(seed, [root.id, a.id, z.id]);
    const crawl = await create(seed);
    expect(record(crawl.configuration).requested_page_limit).toBe(3);
    const analyzed = await db
      .selectFrom('site_crawl_tasks')
      .select('site_url_id')
      .where('crawl_id', '=', crawl.id)
      .where('task_kind', '=', 'analyze')
      .execute();
    expect(analyzed.map((task) => task.site_url_id).sort()).toEqual([root.id, a.id, z.id].sort());
  });

  it('allows bootstrap reruns in sample mode as their own one-page crawl', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    const crawl = await create(tenant);
    const member = await db
      .selectFrom('monitored_site_urls')
      .selectAll()
      .where('project_id', '=', tenant.projectId)
      .executeTakeFirstOrThrow();
    await cancelCrawl(db, tenant.workspaceId, crawl.id);
    const result = await db
      .transaction()
      .execute((trx) => rerunPage(trx, tenant.workspaceId, tenant.projectId, member.site_url_id));
    expect(result.crawl_id).not.toBe(crawl.id);
    const rerun = await db
      .selectFrom('site_crawls')
      .select('configuration')
      .where('id', '=', result.crawl_id)
      .executeTakeFirstOrThrow();
    expect(record(rerun.configuration).page_rerun).toBe(true);
  });

  it('refuses a page re-audit while a crawl runs and adds no work to that crawl (SH-B4)', async () => {
    const seed = await fixtures.crawl('running');
    await allow(seed, 2, 10);
    const page = await fixtures.page(seed, '/a', {}, { observed: true });
    await fixtures.monitor(seed, [page.id]);
    const tasks = () =>
      db
        .selectFrom('site_crawl_tasks')
        .select('id')
        .where('crawl_id', '=', seed.crawlId)
        .execute()
        .then((rows) => rows.length);
    const before = await tasks();
    const response = await request(
      seed,
      `/site-crawls/${seed.crawlId}/pages/${page.id}/rerun`,
      'POST',
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'crawl_already_active' } });
    expect(await tasks()).toBe(before);
    expect(
      await db
        .selectFrom('site_crawls')
        .select('id')
        .where('project_id', '=', seed.projectId)
        .execute(),
    ).toEqual([{ id: seed.crawlId }]);
  });
});

describe('crawl-control HTTP contracts', () => {
  it('preserves coded plan errors and sanitizes invalid query identifiers', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: '' });
    const root = await request(tenant, '/site-crawls', 'POST', { project_id: tenant.projectId });
    expect(root.status).toBe(422);
    const body = record(await root.json());
    expect(body).toMatchObject({
      error: { code: 'invalid_root', retryable: false },
    });
    const invalid = await request(tenant, '/site-crawls?project_id=not-a-uuid');
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      error: { code: 'validation_error', retryable: false },
    });
  });

  it('authorizes every foreign project/crawl/page before exposing evidence or writing', async () => {
    const owner = await fixtures.crawl();
    const foreign = await fixtures.crawl();
    const page = await fixtures.page(foreign, '/private', {});
    const calls: [string, string, unknown?][] = [
      ['/site-crawls', 'POST', { project_id: foreign.projectId }],
      [`/site-crawls?project_id=${foreign.projectId}`, 'GET'],
      [`/site-crawls/${foreign.crawlId}/cancel`, 'POST'],
      [`/projects/${foreign.projectId}/monitored-urls`, 'GET'],
      [`/site-crawls/${foreign.crawlId}/pages/${page.id}/rerun`, 'POST'],
    ];
    for (const [path, method, body] of calls)
      expect((await request(owner, path, method, body)).status, path).toBe(404);
  });

  it('uses read, write and run capabilities and spends failed create attempts on the abuse limit', async () => {
    const seed = await fixtures.crawl();
    const viewer = await fixtures.user();
    await fixtures.member(seed.workspaceId, viewer, 'viewer');
    const reader = { ...seed, userId: viewer };
    expect((await request(reader, `/projects/${seed.projectId}/monitored-urls`)).status).toBe(200);
    expect(
      (await request(reader, '/site-crawls', 'POST', { project_id: seed.projectId })).status,
    ).toBe(403);
    expect((await request(reader, `/site-crawls/${seed.crawlId}/cancel`, 'POST')).status).toBe(403);
    const limited = createApp(testConfig({ ABUSE_CRAWL_CREATE_LIMIT: '1' }), db);
    const create = (projectId: string) =>
      request(seed, '/site-crawls', 'POST', { project_id: projectId }, limited);
    expect((await create(randomUUID())).status).toBe(404);
    expect((await create(seed.projectId)).status).toBe(429);
  });

  it('lists by descending keyset with workspace/project/cursor isolation and count redaction', async () => {
    const seed = await fixtures.crawl();
    const next = await fixtures.sibling(seed, {
      sample_mode: true,
      configuration: JSON.stringify({ count_disclosure: false }),
      discovered_url_count: 99,
      created_at: new Date(Date.now() + 1000),
    });
    const first = siteCrawlListPageSchema.parse(
      await (await request(seed, `/site-crawls?project_id=${seed.projectId}&limit=1`)).json(),
    );
    expect(first.items[0]).toMatchObject({
      id: next,
      discovered_count: null,
      total_url_count: null,
    });
    const second = siteCrawlListPageSchema.parse(
      await (
        await request(
          seed,
          `/site-crawls?project_id=${seed.projectId}&limit=1&cursor=${first.next_cursor}`,
        )
      ).json(),
    );
    expect(second.items.map((crawl) => crawl.id)).toEqual([seed.crawlId]);
    await db
      .updateTable('site_crawls')
      .set({
        score_summary: JSON.stringify({ web_fundamentals_score: 72, aeo_readiness_score: 41 }),
      })
      .where('id', '=', seed.crawlId)
      .execute();
    await fixtures.sibling(seed, {
      configuration: JSON.stringify({ page_rerun: true }),
      created_at: new Date(Date.now() + 2000),
    });
    await fixtures.crawl();
    const all = siteCrawlListPageSchema.parse(await (await request(seed, '/site-crawls')).json());
    expect(all.items.map((crawl) => crawl.id)).toEqual([next, seed.crawlId]);
    expect(all.items[1]!.score_summary).toMatchObject({
      web_fundamentals_score: 72,
      aeo_readiness_score: 41,
    });
    expect((await request(seed, `/site-crawls?cursor=${first.next_cursor}`)).status).toBe(400);
    expect((await request(seed, '/site-crawls?cursor=garbage')).status).toBe(400);
  });

  it('reruns a terminal monitored page as one fresh analysis, then refuses while that rerun runs', async () => {
    const seed = await fixtures.crawl();
    await allow(seed, 1, 2);
    const page = await fixtures.page(seed, '/a', {}, { observed: true });
    await fixtures.monitor(seed, [page.id]);
    await db
      .updateTable('projects')
      .set({ website_url: '' })
      .where('id', '=', seed.projectId)
      .execute();
    const path = `/site-crawls/${seed.crawlId}/pages/${page.id}/rerun`;
    const firstResponse = await request(seed, path, 'POST');
    expect(firstResponse.status, await firstResponse.clone().text()).toBe(202);
    const first = rerunPageResponseSchema.parse(await firstResponse.json());
    expect(first.crawl_id).not.toBe(seed.crawlId);
    const admitted = await db
      .selectFrom('site_crawls')
      .select('configuration')
      .where('id', '=', first.crawl_id)
      .executeTakeFirstOrThrow();
    expect(record(admitted.configuration).requested_page_limit).toBe(1);
    const tasks = await db
      .selectFrom('site_crawl_tasks')
      .selectAll()
      .where('crawl_id', '=', first.crawl_id)
      .execute();
    expect(tasks.map((task) => task.task_kind)).toEqual(['analyze']);
    const second = await request(seed, path, 'POST');
    expect(second.status).toBe(409);
    expect(
      await db
        .selectFrom('site_crawl_tasks')
        .select('id')
        .where('crawl_id', '=', first.crawl_id)
        .execute(),
    ).toEqual([{ id: first.task_id }]);
    expect(
      (await request(seed, `/site-crawls/${seed.crawlId}/pages/${randomUUID()}/rerun`, 'POST'))
        .status,
    ).toBe(404);
  });

  it('keeps Stop short and lets the worker publish retained analysis evidence exactly once', async () => {
    const seed = await fixtures.crawl('running');
    await allow(seed, 1);
    const page = await fixtures.page(seed, '/a', {});
    await fixtures.monitor(seed, [page.id]);
    const response = await request(seed, `/site-crawls/${seed.crawlId}/cancel`, 'POST');
    expect(siteCrawlSchema.parse(await response.json()).status).toBe('cancelled');
    const snapshots = () =>
      db
        .selectFrom('site_health_snapshots')
        .select('id')
        .where('crawl_id', '=', seed.crawlId)
        .execute();
    expect(await snapshots()).toHaveLength(0);
    await publishCancelledCrawls(db, 100);
    expect(await fixtures.terminalize(seed)).toBe(true);
    expect(await snapshots()).toHaveLength(1);
    expect(
      await db
        .selectFrom('site_crawl_events')
        .select('id')
        .where('crawl_id', '=', seed.crawlId)
        .where('event_type', '=', 'crawl.cancelled')
        .execute(),
    ).toHaveLength(1);
  });

  it('persists a stopped crawl’s counters with the stop and reads them, not its tasks, afterwards', async () => {
    const seed = await fixtures.crawl('running');
    await fixtures.page(seed, '/a', {});
    const counters = async (tenant: Tenant = seed) => {
      const response = await request(tenant, `/projects/${seed.projectId}/site-health`);
      return {
        status: response.status,
        body: record(record(await response.json()).crawl).counters,
      };
    };
    const stored = async () =>
      (
        await db
          .selectFrom('site_crawls')
          .select('terminal_counters')
          .where('id', '=', seed.crawlId)
          .executeTakeFirstOrThrow()
      ).terminal_counters;
    expect(await stored()).toBeNull();
    await fixtures.page(seed, '/b', {});
    expect(record((await counters()).body)).toMatchObject({
      analyzed: 2,
      by_page_kind: { product: 2 },
    });
    const { taskId } = await fixtures.analyzable(seed, '/held');
    await db.transaction().execute(async (trx) => {
      await sql`select id from site_crawl_tasks where id = ${taskId} for update`.execute(trx);
      expect((await request(seed, `/site-crawls/${seed.crawlId}/cancel`, 'POST')).status).toBe(200);
    });
    expect(record(await stored())).toMatchObject({
      analyzed: 2,
      queued: 1,
      activity: { state: 'terminal' },
    });
    await sql`update site_crawl_tasks set status = 'cancelled' where id = ${taskId}`.execute(db);
    await reconcileCrawl(db, seed.workspaceId, seed.crawlId);
    expect(record(await stored())).toMatchObject({ analyzed: 2, queued: 0 });
    await fixtures.page(seed, '/late', {});
    expect(record((await counters()).body)).toMatchObject({
      analyzed: 2,
      activity: { state: 'terminal', reason: 'terminal' },
      by_page_kind: { product: 2 },
    });
    expect((await counters(await fixtures.crawl())).status).toBe(404);
  });

  it('lists a crawl with the same counters its dashboard reads, live or persisted', async () => {
    const seed = await fixtures.crawl('running');
    await fixtures.page(seed, '/a', {});
    await fixtures.page(seed, '/b', {});
    const listed = async () => {
      const response = await request(seed, `/site-crawls?project_id=${seed.projectId}`);
      const items = record(await response.json()).items as unknown[];
      return record(record(items.find((item) => record(item).id === seed.crawlId)).counters);
    };
    expect(await listed()).toMatchObject({ analyzed: 2, by_page_kind: { product: 2 } });
    await db
      .updateTable('site_crawls')
      .set({ status: 'completed', completed_at: new Date() })
      .where('id', '=', seed.crawlId)
      .execute();
    expect(await listed()).toMatchObject({ analyzed: 2, by_page_kind: { product: 2 } });
    await db
      .updateTable('site_crawls')
      .set({
        terminal_counters: JSON.stringify({
          ...(await listed()),
          analyzed: 5,
        }),
      })
      .where('id', '=', seed.crawlId)
      .execute();
    await fixtures.page(seed, '/late', {});
    expect(await listed()).toMatchObject({ analyzed: 5 });
  });

  it('retries an actual PostgreSQL crawl lock timeout before cancelling', async () => {
    const seed = await fixtures.crawl('running');
    const impatient = testDatabase({
      ...config,
      database: { ...config.database, lockTimeoutMs: 30 },
    });
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = db.transaction().execute(async (trx) => {
      await trx
        .selectFrom('site_crawls')
        .select('id')
        .where('id', '=', seed.crawlId)
        .forUpdate()
        .execute();
      locked();
      await hold;
    });
    try {
      await ready;
      const stop = cancelCrawl(impatient, seed.workspaceId, seed.crawlId);
      await setTimeout(70);
      release();
      await blocker;
      await stop;
      expect(
        (
          await db
            .selectFrom('site_crawls')
            .select('status')
            .where('id', '=', seed.crawlId)
            .executeTakeFirstOrThrow()
        ).status,
      ).toBe('cancelled');
    } finally {
      release();
      await blocker;
      await impatient.destroy();
    }
  });

  it('audits the same tracked pages on every crawl action, refused while a crawl runs (SH-B7)', async () => {
    const seed = await fixtures.crawl();
    await allow(seed, 3);
    const a = await fixtures.page(seed, '/a', {});
    const b = await fixtures.page(seed, '/b', {});
    await fixtures.monitor(seed, [a.id, b.id]);
    const start = () => request(seed, '/site-crawls', 'POST', { project_id: seed.projectId });
    const audited = async (crawlId: string) =>
      (
        await db
          .selectFrom('site_crawl_tasks as t')
          .innerJoin('site_urls as u', 'u.id', 't.site_url_id')
          .select('u.normalized_url')
          .where('t.crawl_id', '=', crawlId)
          .where('t.task_kind', '=', 'analyze')
          .orderBy('u.normalized_url')
          .execute()
      ).map((row) => row.normalized_url);
    const first = await start();
    expect(first.status).toBe(201);
    const source = siteCrawlSchema.parse(await first.json());
    expect((await start()).status).toBe(409);
    await db
      .updateTable('site_crawls')
      .set({ status: 'completed' })
      .where('id', '=', source.id)
      .execute();
    const second = await start();
    expect(second.status).toBe(201);
    const next = siteCrawlSchema.parse(await second.json());
    const pages = [`${seed.root}`, `${seed.root}a`, `${seed.root}b`];
    expect(await audited(source.id)).toEqual(pages);
    expect(await audited(next.id)).toEqual(pages);
    expect((await request(seed, `/site-crawls/${next.id}/recrawl`, 'POST')).status).toBe(404);
  });

  it('records who chose to ignore robots.txt, and a crawl naming no choice keeps it', async () => {
    const tenant = await fixtures.tenant({ websiteUrl: 'https://example.test/' });
    const { email } = await db
      .selectFrom('users')
      .select('email')
      .where('id', '=', tenant.userId)
      .executeTakeFirstOrThrow();
    const forged = await request(tenant, '/site-crawls', 'POST', {
      project_id: tenant.projectId,
      robots: 'ignore',
      robots_decision: { user_id: randomUUID(), email: 'x@example.test', decided_at: null },
    });
    expect(forged.status).toBe(422);
    const created = await request(tenant, '/site-crawls', 'POST', {
      project_id: tenant.projectId,
      robots: 'ignore',
    });
    expect(created.status).toBe(201);
    const source = siteCrawlSchema.parse(await created.json());
    expect(source.robots).toMatchObject({ handling: 'ignore', decided_by_email: email });
    const frozen = async (id: string) =>
      record(
        (
          await db
            .selectFrom('site_crawls')
            .select('configuration')
            .where('id', '=', id)
            .executeTakeFirstOrThrow()
        ).configuration,
      );
    expect(record((await frozen(source.id)).robots_decision).user_id).toBe(tenant.userId);

    await db
      .updateTable('site_crawls')
      .set({ status: 'completed' })
      .where('id', '=', source.id)
      .execute();
    const rerun = await request(tenant, '/site-crawls', 'POST', { project_id: tenant.projectId });
    expect(rerun.status).toBe(201);
    const next = siteCrawlSchema.parse(await rerun.json());
    expect(next.robots).toEqual(source.robots);
    expect((await frozen(next.id)).robots_decision).toEqual(
      (await frozen(source.id)).robots_decision,
    );

    await db
      .updateTable('site_crawls')
      .set({ status: 'completed' })
      .where('id', '=', next.id)
      .execute();
    const plain = await request(tenant, '/site-crawls', 'POST', {
      project_id: tenant.projectId,
      robots: 'respect',
    });
    expect(siteCrawlSchema.parse(await plain.json()).robots).toEqual({
      handling: 'respect',
      decided_by_email: null,
      decided_at: null,
    });
  });

  it('refuses to ignore robots.txt without a confirming person', () => {
    expect(() => controls({ project_id: randomUUID(), robots: 'ignore' })).toThrow(
      'ignoring robots.txt needs a confirmed, signed-in person',
    );
  });

  it('serializes a terminal rerun with full-crawl admission and keeps one active run', async () => {
    const seed = await fixtures.crawl();
    await allow(seed, 1);
    const page = await fixtures.page(seed, '/a', {});
    await fixtures.monitor(seed, [page.id]);
    await Promise.allSettled([
      create(seed),
      db.transaction().execute((trx) => rerunPage(trx, seed.workspaceId, seed.projectId, page.id)),
    ]);
    expect(
      await db
        .selectFrom('site_crawls')
        .select('id')
        .where('project_id', '=', seed.projectId)
        .where('status', 'in', ['queued', 'running'])
        .execute(),
    ).toHaveLength(1);
  });
});
