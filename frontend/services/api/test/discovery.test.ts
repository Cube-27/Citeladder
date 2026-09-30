import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.ts';
import { completeDiscovery, createDiscovery, discoveryRow } from '../src/projects/discovery.ts';
import { discoveryComplete, discoveryCreate } from '../src/projects/discovery-inputs.ts';
import { FetchError, type WebsiteFetcher } from '../src/projects/safe-fetch.ts';
import { DiscoveryQueue } from '../src/queue/discovery-queue.ts';
import { DiscoveryWorker } from '../src/workers/discovery-worker.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { Fixtures, testConfig, testDatabase } from './support.ts';

const input = discoveryCreate.parse({
  brand_name: 'Acme',
  website_url: 'acme.com',
  primary_market: 'US',
});
const completion = discoveryComplete.parse({
  profile: { category: 'Analytics consultancy' },
  domains: ['acme.com'],
});
const fetcher: WebsiteFetcher = vi.fn(async (url) => ({
  url,
  status: 200,
  contentType: 'text/html',
  body: Buffer.from(
    '<html><head><title>Acme</title></head><body>Analytics services for businesses.</body></html>',
  ),
}));

it('rejects an oversized selected-domain batch before website resolution', () => {
  expect(
    discoveryComplete.safeParse({
      ...completion,
      competitors: [{ name: 'Globex', domains: Array.from({ length: 1000 }, () => 'globex.com') }],
    }).success,
  ).toBe(false);
});

describe('durable onboarding', () => {
  const db = testDatabase();
  const fixtures = new Fixtures(db);
  const workspaces: string[] = [];
  afterEach(async () => {
    if (workspaces.length)
      await db
        .updateTable('brand_discovery_tasks')
        .set({ status: 'succeeded', completed_at: new Date() })
        .where('workspace_id', 'in', workspaces)
        .execute();
  });
  afterAll(async () => {
    await fixtures.cleanup();
    await db.destroy();
  });
  async function tenant() {
    const userId = await fixtures.user();
    const workspaceId = await fixtures.ownedWorkspace(userId);
    workspaces.push(workspaceId);
    return { userId, workspaceId, accountId: await billingAccount(db, workspaceId) };
  }
  async function ready(workspaceId: string) {
    const row = await createDiscovery(db, workspaceId, input, randomUUID());
    await db
      .updateTable('brand_discoveries')
      .set({ status: 'ready' })
      .where('id', '=', row.id)
      .execute();
    return row;
  }
  it('accepts concurrent idempotent requests once with one committed queue row', async () => {
    const t = await tenant();
    const key = randomUUID();
    const rows = await Promise.all([
      createDiscovery(db, t.workspaceId, input, key),
      createDiscovery(db, t.workspaceId, input, key),
    ]);
    expect(rows[0]!.id).toBe(rows[1]!.id);
    const tasks = await db
      .selectFrom('brand_discovery_tasks')
      .selectAll()
      .where('discovery_id', '=', rows[0]!.id)
      .execute();
    expect(tasks).toHaveLength(1);
    await expect(discoveryRow(db, randomUUID(), rows[0]!.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await createApp(testConfig(), db).request('/api/v1/brand-discovery-catalog')).status,
    ).toBe(200);
  });
  it('completes once atomically without prompts or a crawl and freezes reviewed input', async () => {
    const t = await tenant();
    const row = await ready(t.workspaceId);
    const key = randomUUID();
    const outcomes = await Promise.all([
      completeDiscovery(db, t.workspaceId, t.userId, row.id, completion, key, fetcher),
      completeDiscovery(db, t.workspaceId, t.userId, row.id, completion, key, fetcher),
    ]);
    expect(outcomes[0]!.project_id).toBe(outcomes[1]!.project_id);
    const projectId = outcomes[0]!.project_id!;
    const sets = await db
      .selectFrom('prompt_sets')
      .selectAll()
      .where('project_id', '=', projectId)
      .execute();
    expect(sets).toHaveLength(1);
    expect(
      await db
        .selectFrom('prompts')
        .select('id')
        .where('prompt_set_id', '=', sets[0]!.id)
        .execute(),
    ).toEqual([]);
    expect(
      await db.selectFrom('site_crawls').select('id').where('project_id', '=', projectId).execute(),
    ).toEqual([]);
    const profile = await db
      .selectFrom('brand_profiles')
      .select('business_context')
      .where('project_id', '=', projectId)
      .executeTakeFirstOrThrow();
    expect(profile.business_context).toMatchObject({
      category: 'Analytics consultancy',
      field_sources: { category: 'reviewed', primary_market: 'reviewed' },
    });
    await expect(
      completeDiscovery(db, t.workspaceId, t.userId, row.id, completion, 'different', fetcher),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rolls back completion on capacity denial without freezing a partial review', async () => {
    const t = await tenant();
    await grant(db, t.accountId, { key: 'project_slots', value: 0 });
    const row = await ready(t.workspaceId);
    await expect(
      completeDiscovery(db, t.workspaceId, t.userId, row.id, completion, randomUUID(), fetcher),
    ).rejects.toMatchObject({ code: 'occupancy_limit_exceeded' });
    const after = await discoveryRow(db, t.workspaceId, row.id);
    expect(after.project_id).toBeNull();
    expect(after.input_data).not.toHaveProperty('completion_idempotency_key');
    expect(
      await db
        .selectFrom('projects')
        .select('id')
        .where('workspace_id', '=', t.workspaceId)
        .execute(),
    ).toEqual([]);
  });
  it('rejects selected competitor redirects and leaves the review editable', async () => {
    const t = await tenant();
    const row = await ready(t.workspaceId);
    const selected = discoveryComplete.parse({
      ...completion,
      competitors: [{ name: 'Globex', domains: ['globex.com'] }],
    });
    const redirect: WebsiteFetcher = async () => ({
      url: 'https://unrelated.com',
      status: 200,
      contentType: 'text/html',
      body: Buffer.from('hello'),
    });
    await expect(
      completeDiscovery(db, t.workspaceId, t.userId, row.id, selected, randomUUID(), redirect),
    ).rejects.toMatchObject({ status: 409 });
    expect((await discoveryRow(db, t.workspaceId, row.id)).status).toBe('ready');
  });
  it('research persists a degraded review and immutable provenance using recorded responses', async () => {
    const t = await tenant();
    const row = await createDiscovery(db, t.workspaceId, input, randomUUID());
    const worker = new DiscoveryWorker(db, { fetcher, gateway: null, env: {} });
    await worker.runOnce('test-worker');
    const after = await discoveryRow(db, t.workspaceId, row.id);
    expect(after).toMatchObject({
      status: 'ready',
      topics: [],
      prompt_suggestions: [],
      project_id: null,
    });
    expect(after.warnings).toContain('research_degraded');
    const snapshot = await db
      .selectFrom('brand_research_snapshots')
      .selectAll()
      .where('discovery_id', '=', row.id)
      .executeTakeFirstOrThrow();
    expect(snapshot.extracted_fields).toMatchObject({
      evidence_manifest: expect.arrayContaining([
        expect.objectContaining({ source_url: 'https://acme.com/' }),
      ]),
    });
    expect(await worker.runOnce('test-worker')).toBe(false);
  });
  it('claimers do not share a task and expired owners cannot write terminal results', async () => {
    const t = await tenant();
    const row = await createDiscovery(db, t.workspaceId, input, randomUUID());
    const queue = new DiscoveryQueue(db, 30);
    const claimed = await Promise.all([queue.claim('one'), queue.claim('two')]);
    const task = claimed.find((item) => item?.discovery_id === row.id)!;
    expect(claimed.filter((item) => item?.id === task.id)).toHaveLength(1);
    await db
      .updateTable('brand_discovery_tasks')
      .set({ lease_expires_at: new Date(Date.now() - 1) })
      .where('id', '=', task.id)
      .execute();
    expect(await queue.heartbeat(task, task.lease_owner!)).toBe(false);
    const worker = new DiscoveryWorker(db, { fetcher, gateway: null, env: {} });
    await worker.finish(task, task.lease_owner!, null, new FetchError('site_not_found'));
    expect((await discoveryRow(db, t.workspaceId, row.id)).status).toBe('queued');
  });
  it('loses write permission when the lease expires while waiting for a discovery lock', async () => {
    const t = await tenant();
    const row = await createDiscovery(db, t.workspaceId, input, randomUUID());
    const worker = new DiscoveryWorker(db, { fetcher, gateway: null, env: {} });
    const task = (await worker.queue.claim('blocked-worker'))!;
    await db
      .updateTable('brand_discovery_tasks')
      .set({ lease_expires_at: new Date(Date.now() + 400) })
      .where('id', '=', task.id)
      .execute();
    let finish: Promise<void> | undefined;
    await db.transaction().execute(async (trx) => {
      await discoveryRow(trx, t.workspaceId, row.id, true);
      finish = worker.finish(task, 'blocked-worker', null, new FetchError('site_not_found'));
      await sleep(600);
    });
    await finish;
    expect((await discoveryRow(db, t.workspaceId, row.id)).status).toBe('queued');
    expect(
      (
        await db
          .selectFrom('brand_discovery_tasks')
          .select('status')
          .where('id', '=', task.id)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('running');
  });
  it('retries transport failures with redacted errors and drains legacy completion without another research call', async () => {
    const t = await tenant();
    const row = await createDiscovery(db, t.workspaceId, input, randomUUID());
    const worker = new DiscoveryWorker(db, { fetcher, gateway: null, env: {} });
    const task = (await worker.queue.claim('retry-worker'))!;
    await worker.finish(task, 'retry-worker', null, new Error('secret provider response'));
    const retry = await db
      .selectFrom('brand_discovery_tasks')
      .selectAll()
      .where('id', '=', task.id)
      .executeTakeFirstOrThrow();
    expect(retry).toMatchObject({
      status: 'retry_wait',
      attempt_count: 1,
      lease_owner: null,
      error_detail: 'Brand research could not complete',
    });
    await db
      .updateTable('brand_discovery_tasks')
      .set({ available_at: new Date(), max_attempts: 2 })
      .where('id', '=', task.id)
      .execute();
    const final = (await worker.queue.claim('final-worker'))!;
    await worker.finish(final, 'final-worker', null, new Error('another sensitive failure'));
    expect(await discoveryRow(db, t.workspaceId, row.id)).toMatchObject({
      status: 'failed',
      error_detail: 'Brand research could not complete',
    });
    const legacy = await ready(t.workspaceId);
    const accepted = await completeDiscovery(
      db,
      t.workspaceId,
      t.userId,
      legacy.id,
      completion,
      randomUUID(),
      fetcher,
    );
    await db
      .updateTable('brand_discoveries')
      .set({ status: 'completing' })
      .where('id', '=', legacy.id)
      .execute();
    await db
      .updateTable('brand_discovery_tasks')
      .set({ task_kind: 'brand_completion', status: 'queued', available_at: new Date() })
      .where('discovery_id', '=', legacy.id)
      .execute();
    const network = vi.fn<WebsiteFetcher>(async () => {
      throw new Error('must not fetch');
    });
    await new DiscoveryWorker(db, { fetcher: network, gateway: null, env: {} }).runOnce(
      'legacy-worker',
    );
    expect(await discoveryRow(db, t.workspaceId, legacy.id)).toMatchObject({
      status: 'project_created',
      project_id: accepted.project_id,
    });
    expect(network).not.toHaveBeenCalled();
  });
});
