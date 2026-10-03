import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  integrationSyncEnqueueSchema,
  integrationSyncRunSchema,
  integrationSyncRunListSchema,
  integrationBackfillProgressSchema,
} from '@citeladder/contracts/integrations';
import { createApp } from '../src/app.ts';
import { integrationSettings, integrationPolicy } from '../src/integrations/config.ts';
import { enqueueSyncRun, enqueueHistoryBackfill } from '../src/integrations/sync.ts';
import { seedProject } from './referral-fixtures.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
const fixtures = new Fixtures(db);
const settings = integrationSettings({});
let ownerId: string;
const originalTimezone = process.env.TZ;
beforeAll(async () => {
  // PostgreSQL DATE must keep its calendar day even east of UTC.
  process.env.TZ = 'Asia/Kolkata';
  ownerId = await fixtures.user();
});
afterAll(async () => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
  await fixtures.cleanup();
  await db.destroy();
});

async function seedTarget(provider: 'gsc' | 'ga4' | 'bing' = 'gsc') {
  const workspaceId = await fixtures.ownedWorkspace(ownerId);
  const projectId = await seedProject(db, workspaceId);
  const grantId = randomUUID();
  const connectionId = randomUUID();
  const mappingId = randomUUID();
  const now = new Date();
  await db
    .insertInto('integration_oauth_grants')
    .values({
      id: grantId,
      workspace_id: workspaceId,
      transport: provider === 'bing' ? 'microsoft_oauth' : 'google_oauth',
      access_token_encrypted: 'recorded-access-token',
      refresh_token_encrypted: 'recorded-refresh-token',
      token_expires_at: new Date(Date.now() + 3_600_000),
      token_revision: 1,
      refresh_claim_id: null,
      refresh_claim_expires_at: null,
      granted_scopes: JSON.stringify(['https://www.googleapis.com/auth/webmasters.readonly']),
      status: 'connected',
      created_at: now,
      updated_at: now,
    })
    .execute();
  await db
    .insertInto('integration_connections')
    .values({
      id: connectionId,
      workspace_id: workspaceId,
      grant_id: grantId,
      provider,
      label: 'Recorded Search Console',
      account_ref: 'https://example.test',
      dataset_capabilities: JSON.stringify({}),
      last_synced_at: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await db
    .insertInto('integration_property_mappings')
    .values({
      id: mappingId,
      workspace_id: workspaceId,
      connection_id: connectionId,
      provider,
      property_ref: provider === 'ga4' ? '123456789' : 'https://example.test',
      project_id: projectId,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .execute();
  return {
    workspaceId,
    projectId,
    grantId,
    connectionId,
    mappingId,
    propertyRef: provider === 'ga4' ? '123456789' : 'https://example.test',
  };
}

type Target = Awaited<ReturnType<typeof seedTarget>>;

async function request(
  target: Target,
  suffix: string,
  body?: Record<string, string | undefined>,
  userId: string | null = ownerId,
  method = 'GET',
) {
  const headers: Record<string, string> = { 'x-workspace-id': target.workspaceId };
  if (userId)
    headers.cookie = `${config.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`;
  if (body) headers['content-type'] = 'application/json';
  return app.request(`/api/v1/integrations/${target.connectionId}${suffix}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function enqueue(target: Target, body?: Record<string, string | undefined>) {
  const response = await request(target, '/sync', body, ownerId, 'POST');
  expect(response.status).toBe(202);
  return integrationSyncEnqueueSchema.parse(await response.json());
}

async function detail(target: Target, id: string) {
  const response = await request(target, `/syncs/${id}`);
  expect(response.status).toBe(200);
  return integrationSyncRunSchema.parse(await response.json());
}

async function seedHistory(target: Target, statuses: string[]) {
  const ranges = [
    ['2026-07-04', '2026-07-31'],
    ['2026-06-06', '2026-07-03'],
    ['2026-05-09', '2026-06-05'],
  ];
  for (const [index, status] of statuses.entries()) {
    const [windowStart, windowEnd] = ranges[index]!;
    const run = await enqueueSyncRun(db, {
      ...target,
      windowStart,
      windowEnd,
      syncKind: 'backfill',
    });
    await db
      .updateTable('integration_sync_runs')
      .set({ status })
      .where('id', '=', run.sync_run_id)
      .execute();
  }
}

async function progress(target: Target) {
  const response = await request(target, '/syncs/progress');
  expect(response.status).toBe(200);
  return integrationBackfillProgressSchema.parse(await response.json());
}

describe('integration sync API and immutable windows', () => {
  it('bounds distinct windows concurrently per workspace and leaves duplicates uncharged', async () => {
    const target = await seedTarget();
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => {
        const date = `2026-07-${String(index + 1).padStart(2, '0')}`;
        return request(target, '/sync', { window_start: date, window_end: date }, ownerId, 'POST');
      }),
    );
    expect(results.filter((result) => result.status === 202)).toHaveLength(10);
    expect(results.filter((result) => result.status === 429)).toHaveLength(2);
    const run = await db
      .selectFrom('integration_sync_runs')
      .select(sql<string>`window_start::text`.as('date'))
      .where('workspace_id', '=', target.workspaceId)
      .executeTakeFirstOrThrow();
    const date = run.date;
    expect(
      (await request(target, '/sync', { window_start: date, window_end: date }, ownerId, 'POST'))
        .status,
    ).toBe(409);
    expect(
      await db
        .selectFrom('usage_windows')
        .select('count')
        .where('operation', '=', 'integrations.sync.on_demand')
        .where(
          'subject_hash',
          '=',
          (await import('node:crypto'))
            .createHash('sha256')
            .update(target.workspaceId)
            .digest('hex'),
        )
        .executeTakeFirstOrThrow(),
    ).toEqual({ count: 10 });
    expect((await enqueue(await seedTarget())).status).toBe('queued');
  });

  it('rejects a new window at capacity, frees terminal slots, and exempts scheduled/backfill work', async () => {
    const target = await seedTarget();
    for (let index = 0; index < 20; index++) {
      const date = `2026-06-${String(index + 1).padStart(2, '0')}`;
      const run = await enqueueSyncRun(db, {
        ...target,
        windowStart: date,
        windowEnd: date,
        syncKind: 'backfill',
      });
      await db
        .updateTable('integration_sync_runs')
        .set({ status: ['queued', 'leased', 'running', 'retry_wait'][index % 4]! })
        .where('id', '=', run.sync_run_id)
        .execute();
    }
    expect(
      (
        await request(
          target,
          '/sync',
          { window_start: '2026-07-01', window_end: '2026-07-01' },
          ownerId,
          'POST',
        )
      ).status,
    ).toBe(429);
    await enqueueSyncRun(db, { ...target, syncKind: 'scheduled' });
    await db
      .updateTable('integration_sync_runs')
      .set({ status: 'succeeded', completed_at: new Date() })
      .where('workspace_id', '=', target.workspaceId)
      .where('window_start', '<=', new Date('2026-06-02T00:00:00Z'))
      .execute();
    expect(
      (await enqueue(target, { window_start: '2026-07-01', window_end: '2026-07-01' })).status,
    ).toBe('queued');
    expect((await enqueue(await seedTarget())).status).toBe('queued');
  });
  it('returns a 202 enqueue identity and freezes the default UTC window without credentials', async () => {
    const target = await seedTarget();
    const before = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const enqueued = await enqueue(target);
    expect(enqueued).toMatchObject({ connection_id: target.connectionId, status: 'queued' });
    const run = await detail(target, enqueued.sync_run_id);
    expect(run).toMatchObject({ sync_kind: 'on_demand', resync_seq: 0, window_end: before });
    expect((Date.parse(run.window_end) - Date.parse(run.window_start)) / 86_400_000 + 1).toBe(
      settings.sync_default_window_days,
    );
    const stored = await db
      .selectFrom('integration_sync_runs')
      .selectAll()
      .where('id', '=', run.id)
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({
      mapping_id: target.mappingId,
      property_ref: target.propertyRef,
      project_id: target.projectId,
    });
  });

  it('stores explicit windows and clamps them to the configured history bound', async () => {
    const target = await seedTarget();
    const first = await enqueue(target, { window_start: '2026-07-01', window_end: '2026-07-05' });
    expect(await detail(target, first.sync_run_id)).toMatchObject({
      window_start: '2026-07-01',
      window_end: '2026-07-05',
      row_count: 0,
      completed_at: null,
      error_code: '',
      error_detail: '',
    });
    const second = await enqueue(target, { window_start: '2020-01-01', window_end: '2026-01-01' });
    const run = await detail(target, second.sync_run_id);
    expect(run.window_end).toBe('2026-01-01');
    expect((Date.parse(run.window_end) - Date.parse(run.window_start)) / 86_400_000 + 1).toBe(
      settings.sync_backfill_max_days,
    );
  });

  it.each([
    { window_start: '2026-07-05', window_end: '2026-07-01' },
    { window_start: '2026-07-01' },
    { window_start: '2026-02-30', window_end: '2026-03-01' },
  ])('rejects an invalid or incomplete window %j', async (body) => {
    const target = await seedTarget();
    const response = await request(target, '/sync', body, ownerId, 'POST');
    expect(response.status).toBe(422);
    expect(
      await db
        .selectFrom('integration_sync_runs')
        .select('id')
        .where('connection_id', '=', target.connectionId)
        .execute(),
    ).toEqual([]);
  });

  it('rejects a duplicate active window and bumps the revision after completion', async () => {
    const target = await seedTarget();
    const body = { window_start: '2026-07-01', window_end: '2026-07-03' };
    const first = await enqueue(target, body);
    const duplicate = await request(target, '/sync', body, ownerId, 'POST');
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      error: { code: 'sync_active_window_conflict' },
    });
    await db
      .updateTable('integration_sync_runs')
      .set({ status: 'succeeded', completed_at: new Date() })
      .where('id', '=', first.sync_run_id)
      .execute();
    const second = await enqueue(target, body);
    expect(second.sync_run_id).not.toBe(first.sync_run_id);
    expect(await detail(target, second.sync_run_id)).toMatchObject({
      resync_seq: 1,
      status: 'queued',
    });
    expect(await detail(target, first.sync_run_id)).toMatchObject({
      resync_seq: 0,
      status: 'succeeded',
    });
  });

  it('lists the newest runs and sums their own immutable artifacts', async () => {
    const target = await seedTarget();
    const older = await enqueue(target, { window_start: '2026-07-01', window_end: '2026-07-03' });
    const newer = await enqueue(target, { window_start: '2026-07-04', window_end: '2026-07-06' });
    await db
      .updateTable('integration_sync_runs')
      .set({ created_at: new Date('2026-07-01T00:00:00Z') })
      .where('id', '=', older.sync_run_id)
      .execute();
    for (const count of [5, 7]) {
      await db
        .insertInto('integration_import_artifacts')
        .values({
          id: randomUUID(),
          sync_run_id: older.sync_run_id,
          connection_id: target.connectionId,
          workspace_id: target.workspaceId,
          provider: 'gsc',
          dataset: 'gsc_page_daily',
          query_snapshot: JSON.stringify({ startRow: count }),
          payload_hash: String(count).repeat(64),
          row_count: count,
          payload: JSON.stringify({ rows: [] }),
          fetched_at: new Date(),
          created_at: new Date(),
        })
        .execute();
    }
    const response = await request(target, '/syncs');
    expect(response.status).toBe(200);
    const runs = integrationSyncRunListSchema.parse(await response.json());
    expect(runs.map((run) => [run.id, run.row_count])).toEqual([
      [newer.sync_run_id, 0],
      [older.sync_run_id, 12],
    ]);
  });

  it('hides unknown runs, mismatched connections, and another workspace', async () => {
    const target = await seedTarget();
    const enqueued = await enqueue(target);
    const other = await seedTarget('ga4');
    const foreignOwner = await fixtures.user();
    for (const [selected, suffix, user] of [
      [target, `/syncs/${randomUUID()}`, ownerId],
      [other, `/syncs/${enqueued.sync_run_id}`, ownerId],
      [target, '/syncs', foreignOwner],
      [target, `/syncs/${enqueued.sync_run_id}`, foreignOwner],
      [target, '/syncs/progress', foreignOwner],
    ] as const)
      expect((await request(selected, suffix, undefined, user)).status).toBe(404);
    expect((await request(target, '/sync', undefined, foreignOwner, 'POST')).status).toBe(404);
    const unknown = { ...target, connectionId: randomUUID() };
    expect((await request(unknown, '/syncs/progress')).status).toBe(404);
    expect((await request(unknown, `/syncs/${enqueued.sync_run_id}`)).status).toBe(404);
  });

  it('requires authentication for sync writes and projections', async () => {
    const target = await seedTarget();
    for (const suffix of ['/syncs', `/syncs/${randomUUID()}`, '/syncs/progress'])
      expect((await request(target, suffix, undefined, null)).status).toBe(401);
    expect((await request(target, '/sync', undefined, null, 'POST')).status).toBe(401);
  });

  it('requires an active unambiguous property mapping', async () => {
    const target = await seedTarget();
    await db
      .updateTable('integration_property_mappings')
      .set({ status: 'disabled' })
      .where('id', '=', target.mappingId)
      .execute();
    const response = await request(target, '/sync', undefined, ownerId, 'POST');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'sync_target_unresolved' } });
  });
});

describe('backfill projection and retry', () => {
  it('keeps no history distinct from zero imported windows and ignores on-demand work', async () => {
    const target = await seedTarget();
    await enqueue(target);
    expect(await progress(target)).toMatchObject({
      state: 'not_started',
      total_windows: 0,
      covered_from: null,
      covered_through: null,
    });
  });

  it.each([
    {
      statuses: ['succeeded', 'queued', 'failed'],
      state: 'importing',
      completed: 1,
      failed: 1,
      pending: 1,
    },
    { statuses: ['succeeded', 'failed'], state: 'partial', completed: 1, failed: 1, pending: 0 },
    {
      statuses: ['succeeded', 'succeeded'],
      state: 'complete',
      completed: 2,
      failed: 0,
      pending: 0,
    },
  ])(
    'projects $state from window outcomes without mixing connections',
    async ({ statuses, state, completed, failed, pending }) => {
      const target = await seedTarget();
      const other = await seedTarget('ga4');
      await seedHistory(target, statuses);
      const result = await progress(target);
      expect(result).toMatchObject({
        state,
        total_windows: statuses.length,
        completed_windows: completed,
        failed_windows: failed,
        pending_windows: pending,
        covered_through: '2026-07-31',
      });
      expect(await progress(other)).toMatchObject({ state: 'not_started', total_windows: 0 });
    },
  );

  it('stops coverage at a failed middle window and resumes only that missing window', async () => {
    const target = await seedTarget();
    await seedHistory(target, ['succeeded', 'failed', 'succeeded']);
    expect(await progress(target)).toMatchObject({
      state: 'partial',
      covered_from: '2026-05-09',
      covered_through: '2026-06-05',
    });
    await enqueueHistoryBackfill(db, target);
    const runs = await db
      .selectFrom('integration_sync_runs')
      .select(['id', 'status'])
      .where('connection_id', '=', target.connectionId)
      .execute();
    expect(runs).toHaveLength(4);
    const retry = runs.find((run) => run.status === 'queued')!;
    await enqueueHistoryBackfill(db, target);
    expect(
      await db
        .selectFrom('integration_sync_runs')
        .select('id')
        .where('connection_id', '=', target.connectionId)
        .execute(),
    ).toHaveLength(4);
    await db
      .updateTable('integration_sync_runs')
      .set({ status: 'succeeded' })
      .where('id', '=', retry.id)
      .execute();
    expect(await progress(target)).toMatchObject({
      state: 'complete',
      total_windows: 3,
      failed_windows: 0,
      covered_through: '2026-07-31',
    });
  });

  it('queues the free history allowance once and preserves the frozen property', async () => {
    const target = await seedTarget();
    await enqueueHistoryBackfill(db, target);
    const response = await request(target, '/syncs');
    const runs = integrationSyncRunListSchema.parse(await response.json());
    expect(runs.length).toBeGreaterThan(0);
    const totalDays = runs.reduce(
      (sum, run) =>
        sum + (Date.parse(run.window_end) - Date.parse(run.window_start)) / 86_400_000 + 1,
      0,
    );
    expect(totalDays).toBe(
      Math.min(integrationPolicy.free_history_window_days, settings.sync_backfill_max_days),
    );
    await enqueueHistoryBackfill(db, target);
    expect((await progress(target)).total_windows).toBe(runs.length);
  });
});
