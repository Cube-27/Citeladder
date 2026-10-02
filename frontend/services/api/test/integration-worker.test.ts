import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { IntegrationClient } from '../src/integrations/client.ts';
import { IntegrationError } from '../src/integrations/client.ts';
import { integrationPolicy, integrationSettings } from '../src/integrations/config.ts';
import { IntegrationWorker } from '../src/workers/integration-worker.ts';
import { recoverIntegrationLeases, recoverQueues } from '../src/queue/recovery.ts';
import { referralEventFields } from '../src/referrals/events.ts';
import { seedProject } from './referral-fixtures.ts';
import { Fixtures, testDatabase } from './support.ts';
import { setLogSink } from '../src/logging.ts';

const db = testDatabase();
const fixtures = new Fixtures(db);
const settings = { ...integrationSettings({}), sync_page_size: 2 };
let ownerId: string;

beforeAll(async () => {
  ownerId = await fixtures.user();
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

async function seedRun(provider: 'gsc' | 'ga4' | 'bing' = 'gsc') {
  const workspaceId = await fixtures.ownedWorkspace(ownerId);
  const projectId = await seedProject(db, workspaceId);
  const grantId = randomUUID();
  const connectionId = randomUUID();
  const mappingId = randomUUID();
  const runId = randomUUID();
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
  await db
    .insertInto('integration_sync_runs')
    .values({
      id: runId,
      workspace_id: workspaceId,
      connection_id: connectionId,
      mapping_id: mappingId,
      property_ref: provider === 'ga4' ? '123456789' : 'https://example.test',
      project_id: projectId,
      sync_kind: 'on_demand',
      window_start: new Date('2026-07-20T00:00:00Z'),
      window_end: new Date('2026-07-21T00:00:00Z'),
      resync_seq: 1,
      idempotency_key: `sync-test:${runId}`,
      status: 'queued',
      priority: 0,
      randomized_position: 0,
      available_at: now,
      attempt_count: 0,
      max_attempts: 4,
      lease_owner: null,
      lease_expires_at: null,
      heartbeat_at: null,
      error_code: '',
      error_detail: '',
      created_at: now,
      updated_at: now,
      completed_at: null,
    })
    .execute();

  return { workspaceId, projectId, grantId, connectionId, mappingId, runId };
}

describe('integration worker paging and resume', () => {
  it('publishes with a live database lease despite a skewed application clock', async () => {
    const run = await seedRun();
    const skewed = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400000);
    try {
      const client = { page: async () => ({ payload: { rows: [] }, rawRowCount: 0 }) };
      const worker = new IntegrationWorker(db, client, settings, async () => 'recorded-token');
      expect(await worker.runOnce()).toBe(true);
      const result = await db
        .selectFrom('integration_sync_runs')
        .select('status')
        .where('id', '=', run.runId)
        .executeTakeFirstOrThrow();
      expect(result.status).toBe('succeeded');
    } finally {
      skewed.mockRestore();
    }
  });
  it('reports partial sweep failure after recovering the independent queue', async () => {
    const run = await seedRun();
    await db
      .updateTable('integration_sync_runs')
      .set({
        status: 'running',
        attempt_count: 1,
        lease_owner: 'dead-worker',
        lease_expires_at: new Date(Date.now() - 1000),
      })
      .where('id', '=', run.runId)
      .execute();
    const transaction = vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('discovery queue unavailable');
    });
    try {
      await expect(recoverQueues(db)).rejects.toThrow('Queue recovery failed');
      const recovered = await db
        .selectFrom('integration_sync_runs')
        .select(['status', 'attempt_count'])
        .where('id', '=', run.runId)
        .executeTakeFirstOrThrow();
      expect(recovered).toEqual({ status: 'retry_wait', attempt_count: 1 });
    } finally {
      transaction.mockRestore();
      await db
        .updateTable('integration_sync_runs')
        .set({ status: 'succeeded' })
        .where('id', '=', run.runId)
        .execute();
    }
  });
  it('claims by priority and availability while concurrent workers never share a run', async () => {
    const low = await seedRun(),
      high = await seedRun(),
      other = await seedRun();
    const future = await seedRun();
    await db
      .updateTable('integration_sync_runs')
      .set({ priority: 10 })
      .where('id', '=', high.runId)
      .execute();
    await db
      .updateTable('integration_sync_runs')
      .set({ available_at: new Date(Date.now() + 3600000) })
      .where('id', '=', future.runId)
      .execute();
    const grants: string[] = [];
    const client = { page: vi.fn(async () => ({ payload: { rows: [] }, rawRowCount: 0 })) };
    const token: ConstructorParameters<typeof IntegrationWorker>[3] = async (_db, grantId) => {
      grants.push(grantId);
      return 'recorded-token';
    };
    const workers = [
      new IntegrationWorker(db, client, settings, token),
      new IntegrationWorker(db, client, settings, token),
    ];
    await workers[0]!.runOnce();
    expect(grants).toEqual([high.grantId]);
    expect(await Promise.all(workers.map((worker) => worker.runOnce()))).toEqual([true, true]);
    expect(grants.slice(1).sort()).toEqual([low.grantId, other.grantId].sort());
    expect(await workers[0]!.runOnce()).toBe(false);
  });

  it('heartbeats a live request but denies late publication after recovery takes its lease', async () => {
    const target = await seedRun();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const client = {
      page: vi.fn(async () => {
        entered();
        await gate;
        return { payload: { rows: [] }, rawRowCount: 0 };
      }),
    };
    const worker = new IntegrationWorker(
      db,
      client,
      { ...settings, heartbeat_interval_seconds: 0.01 },
      async () => 'recorded-token',
    );
    const running = worker.runOnce();
    const row = () =>
      db
        .selectFrom('integration_sync_runs')
        .selectAll()
        .where('id', '=', target.runId)
        .executeTakeFirstOrThrow();
    try {
      await started;
      const initial = await row();
      await vi.waitFor(async () =>
        expect((await row()).lease_expires_at!.getTime()).toBeGreaterThan(
          initial.lease_expires_at!.getTime(),
        ),
      );
      expect(await recoverIntegrationLeases(db)).toBe(0);
      await db
        .updateTable('integration_sync_runs')
        .set({ lease_expires_at: new Date(Date.now() - 1000) })
        .where('id', '=', target.runId)
        .execute();
      expect(await recoverIntegrationLeases(db)).toBe(1);
    } finally {
      release();
      await running;
    }
    expect(await row()).toMatchObject({
      status: 'retry_wait',
      lease_owner: null,
      attempt_count: 1,
    });
    expect(
      await db
        .selectFrom('integration_import_artifacts')
        .select('id')
        .where('sync_run_id', '=', target.runId)
        .execute(),
    ).toEqual([]);
    // Keep this fixture out of later worker claims.
    await db
      .updateTable('integration_sync_runs')
      .set({ status: 'cancelled' })
      .where('id', '=', target.runId)
      .execute();
  });

  it('recovers crashed attempts without charging twice and never retries an exhausted run', async () => {
    const retry = await seedRun(),
      exhausted = await seedRun();
    await db
      .updateTable('integration_sync_runs')
      .set({
        status: 'running',
        lease_owner: 'dead-worker',
        lease_expires_at: new Date(Date.now() - 1000),
        attempt_count: 1,
        max_attempts: 2,
      })
      .where('id', 'in', [retry.runId, exhausted.runId])
      .execute();
    await db
      .updateTable('integration_sync_runs')
      .set({ attempt_count: 2 })
      .where('id', '=', exhausted.runId)
      .execute();
    const logs: string[] = [];
    const previousSink = setLogSink((line) => logs.push(line));
    let reclaimed: number[];
    try {
      reclaimed = await Promise.all([
        recoverIntegrationLeases(db, 1),
        recoverIntegrationLeases(db, 1),
      ]);
    } finally {
      setLogSink(previousSink);
    }
    expect(logs.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({
        event: 'queue_task_attempts_exhausted',
        queue: 'integration_sync_runs',
        task_id: exhausted.runId,
        workspace_id: exhausted.workspaceId,
        attempt_count: 2,
      }),
    );
    expect(reclaimed.reduce((a, b) => a + b, 0)).toBe(2);
    const terminal = await db
      .selectFrom('integration_sync_runs')
      .selectAll()
      .where('id', '=', exhausted.runId)
      .executeTakeFirstOrThrow();
    expect(terminal).toMatchObject({
      status: 'failed',
      attempt_count: 2,
      lease_owner: null,
      error_code: 'max_attempts_exceeded',
    });
    expect(terminal.completed_at).not.toBeNull();
    const client = { page: vi.fn(async () => ({ payload: { rows: [] }, rawRowCount: 0 })) };
    const worker = new IntegrationWorker(db, client, settings, async () => 'recorded-token');
    expect(await worker.runOnce()).toBe(true);
    expect(
      await db
        .selectFrom('integration_sync_runs')
        .select(['status', 'attempt_count'])
        .where('id', '=', retry.runId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: 'succeeded', attempt_count: 2 });
    expect(await worker.runUntilIdle()).toBe(0);
  });
  it.each([
    {
      value: { reason: 'recorded non-Error rejection' },
      expected: '{"reason":"recorded non-Error rejection"}',
    },
    { value: 23n, expected: 'Unserializable integration failure' },
  ])(
    'records a useful bounded detail for non-Error rejections: $expected',
    async ({ value, expected }) => {
      const target = await seedRun();
      const worker = new IntegrationWorker(
        db,
        { page: vi.fn().mockRejectedValue(value) },
        settings,
        async () => 'recorded-token',
      );
      await worker.runOnce();
      const run = await db
        .selectFrom('integration_sync_runs')
        .select(['status', 'error_detail'])
        .where('id', '=', target.runId)
        .executeTakeFirstOrThrow();
      expect(run).toMatchObject({ status: 'failed', error_detail: expected });
    },
  );
  it('survives an iteration failure and delays the next attempt until the poll interval', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const worker = new IntegrationWorker(
      db,
      { page: vi.fn() },
      settings,
      async () => 'recorded-token',
    );
    const iteration = vi
      .spyOn(worker, 'runOnce')
      .mockRejectedValueOnce(new Error('recorded claim failure'))
      .mockImplementationOnce(async () => {
        controller.abort();
        return false;
      });
    try {
      const loop = worker.runForever(controller.signal);
      await vi.advanceTimersByTimeAsync(settings.poll_interval_seconds * 1000 - 1);
      expect(iteration).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await loop;
      expect(iteration).toHaveBeenCalledTimes(2);
    } finally {
      controller.abort();
      vi.useRealTimers();
    }
  });
  it('rejects a mapping retired while a provider request is in flight', async () => {
    const { mappingId, runId } = await seedRun();
    const client: Pick<IntegrationClient, 'page'> = {
      async page() {
        await db
          .updateTable('integration_property_mappings')
          .set({ status: 'disabled' })
          .where('id', '=', mappingId)
          .execute();
        return { payload: { rows: [] }, rawRowCount: 0 };
      },
    };
    await new IntegrationWorker(db, client, settings, async () => 'recorded-token').runOnce();
    const run = await db
      .selectFrom('integration_sync_runs')
      .select(['status', 'error_code'])
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(run).toEqual({ status: 'failed', error_code: 'unmapped_property' });
    expect(
      await db
        .selectFrom('integration_import_artifacts')
        .select('id')
        .where('sync_run_id', '=', runId)
        .execute(),
    ).toEqual([]);
  });

  it('resumes the next uncommitted page of a Python-format run', async () => {
    const { workspaceId, connectionId, runId } = await seedRun();
    for (const offset of [0, 2]) {
      await db
        .insertInto('integration_import_artifacts')
        .values({
          id: randomUUID(),
          sync_run_id: runId,
          workspace_id: workspaceId,
          connection_id: connectionId,
          provider: 'gsc',
          dataset: 'gsc_page_daily',
          query_snapshot: JSON.stringify({ startRow: offset }),
          row_count: 2,
          payload: JSON.stringify({ rows: [] }),
          payload_hash: `legacy-${offset}`,
          fetched_at: new Date(),
          created_at: new Date(),
        })
        .execute();
    }
    const offsets: number[] = [];
    const client: Pick<IntegrationClient, 'page'> = {
      async page(_provider, _token, _property, template, _start, _end, offset) {
        if (template.dataset === 'gsc_page_daily') offsets.push(offset);
        return { payload: { rows: [] }, rawRowCount: 0 };
      },
    };
    await new IntegrationWorker(db, client, settings, async () => 'recorded-token').runOnce();
    expect(offsets).toEqual([4]);
    expect(
      (
        await db
          .selectFrom('integration_sync_runs')
          .select('status')
          .where('id', '=', runId)
          .executeTakeFirstOrThrow()
      ).status,
    ).toBe('succeeded');
  });

  it('keeps the raw Bing report but derives only real dates inside its frozen window', async () => {
    const { runId } = await seedRun('bing');
    const rows = ['2026-07-19', '2026-07-20', '2026-07-22', '2026-02-30'].map((date) => ({
      keys: ['example query', date],
      clicks: 3,
      impressions: 10,
    }));
    const client: Pick<IntegrationClient, 'page'> = {
      async page() {
        return { payload: { rows }, rawRowCount: rows.length };
      },
    };
    await new IntegrationWorker(db, client, settings, async () => 'recorded-token').runOnce();
    const metrics = await db
      .selectFrom('integration_metric_rows as metric')
      .innerJoin(
        'integration_import_artifacts as artifact',
        'artifact.id',
        'metric.source_artifact_id',
      )
      .select('metric.dimension_key')
      .where('artifact.sync_run_id', '=', runId)
      .execute();
    expect(metrics.map((row) => row.dimension_key)).toEqual([
      'example query | 2026-07-20',
      'example query | 2026-07-20',
    ]);
    const artifacts = await db
      .selectFrom('integration_import_artifacts')
      .select('payload')
      .where('sync_run_id', '=', runId)
      .execute();
    expect(
      artifacts.every((artifact) => (artifact.payload as { rows: unknown[] }).rows.length === 4),
    ).toBe(true);
  });

  it('falls back narrowly for GA4, reuses the capability, and produces consumable referral keys', async () => {
    const { runId, connectionId, projectId } = await seedRun('ga4');
    const requested: string[] = [];
    const client: Pick<IntegrationClient, 'page'> = {
      async page(_provider, _token, _property, template) {
        requested.push(template.dataset);
        if (template.dataset === 'ga4_item_source_medium_daily')
          throw new IntegrationError(
            'ga4_dimension_incompatible',
            'recorded incompatible dimensions',
          );
        const rows =
          template.dataset === 'ga4_source_medium_daily'
            ? [
                {
                  dimensionValues: [
                    { value: 'chatgpt.com' },
                    { value: 'referral' },
                    { value: '20260720' },
                  ],
                  metricValues: template.metrics.map(() => ({ value: '2' })),
                },
              ]
            : [];
        return { payload: { rows }, rawRowCount: rows.length };
      },
    };
    const worker = new IntegrationWorker(db, client, settings, async () => 'recorded-token');
    await worker.runOnce();
    const finished = await db
      .selectFrom('integration_sync_runs')
      .selectAll()
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(finished.status).toBe('succeeded');
    const successors = await db
      .selectFrom('analytics_tasks')
      .select('task_kind')
      .where('workspace_id', '=', finished.workspace_id)
      .where('project_id', '=', projectId)
      .execute();
    expect(successors.map((task) => task.task_kind)).toEqual(
      expect.arrayContaining(['ingest_referrals', 'traffic_snapshot_refresh']),
    );
    expect(requested.filter((dataset) => dataset.startsWith('ga4_item_'))).toEqual([
      'ga4_item_source_medium_daily',
      'ga4_item_channel_group_daily',
    ]);
    const metric = await db
      .selectFrom('integration_metric_rows')
      .select(['dataset', 'dimension_key'])
      .where('project_id', '=', projectId)
      .where('dataset', '=', 'ga4_source_medium_daily')
      .executeTakeFirstOrThrow();
    expect(referralEventFields({ ...metric, date: '2026-07-20' })?.utm_source).toBe('chatgpt.com');
    const connection = await db
      .selectFrom('integration_connections')
      .select('dataset_capabilities')
      .where('id', '=', connectionId)
      .executeTakeFirstOrThrow();
    expect(
      (connection.dataset_capabilities as Record<string, { selected_dataset: string }>)[
        integrationPolicy.ga4_capability_key
      ]?.selected_dataset,
    ).toBe('ga4_item_channel_group_daily');
    await db
      .insertInto('integration_sync_runs')
      .values({
        ...finished,
        id: randomUUID(),
        idempotency_key: `second:${runId}`,
        resync_seq: 2,
        status: 'queued',
        attempt_count: 0,
        completed_at: null,
      })
      .execute();
    requested.length = 0;
    await worker.runOnce();
    expect(requested.filter((dataset) => dataset.startsWith('ga4_item_'))).toEqual([
      'ga4_item_channel_group_daily',
    ]);
  });

  it('does not turn an unrelated GA4 provider error into a fallback', async () => {
    const { runId } = await seedRun('ga4');
    const requested: string[] = [];
    const client: Pick<IntegrationClient, 'page'> = {
      async page(_provider, _token, _property, template) {
        requested.push(template.dataset);
        if (template.dataset === 'ga4_item_source_medium_daily')
          throw new IntegrationError('provider_api_error', 'recorded provider failure');
        return { payload: { rows: [] }, rawRowCount: 0 };
      },
    };
    await new IntegrationWorker(db, client, settings, async () => 'recorded-token').runOnce();
    expect(requested).not.toContain('ga4_item_channel_group_daily');
    expect(
      await db
        .selectFrom('integration_sync_runs')
        .select(['status', 'error_code'])
        .where('id', '=', runId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ status: 'failed', error_code: 'provider_api_error' });
  });

  it('continues after a committed provider page when a later request fails', async () => {
    const recordedPage = async (name: string): Promise<Record<string, unknown>> =>
      JSON.parse(
        await readFile(
          new URL(`../../../../backend/tests/fixtures/integrations/${name}`, import.meta.url),
          'utf8',
        ),
      ) as Record<string, unknown>;
    const pageOne = await recordedPage('gsc_search_analytics_page1.json');
    const pageTwo = await recordedPage('gsc_search_analytics_page2.json');
    const { runId } = await seedRun();
    const firstDataset = Object.values(integrationPolicy.datasets).find(
      (item) => item.dataset === 'gsc_page_daily',
    );
    if (!firstDataset) throw new Error('GSC page dataset policy is missing');
    let interrupted = false;
    const offsets: number[] = [];
    const client: Pick<IntegrationClient, 'page'> = {
      async page(_provider, _token, _property, template, _start, _end, offset) {
        if (template.dataset !== firstDataset.dataset)
          return { payload: { rows: [] }, rawRowCount: 0 };
        offsets.push(offset);
        if (offset === 2 && !interrupted) {
          interrupted = true;
          throw new IntegrationError('provider_api_error', 'recorded page interruption', true);
        }
        const payload = offset === 0 ? pageOne : pageTwo;
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        return { payload, rawRowCount: rows.length };
      },
    };
    const worker = new IntegrationWorker(db, client, settings, async () => 'recorded-access-token');

    expect(await worker.runOnce()).toBe(true);
    const firstAttempt = await db
      .selectFrom('integration_sync_runs')
      .select(['status', 'attempt_count'])
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(firstAttempt.status).toBe('retry_wait');
    expect(firstAttempt.attempt_count).toBe(1);
    const committed = await db
      .selectFrom('integration_import_artifacts')
      .select(['query_snapshot', 'row_count'])
      .where('sync_run_id', '=', runId)
      .where('dataset', '=', firstDataset.dataset)
      .executeTakeFirstOrThrow();
    expect(committed.row_count).toBe(2);
    expect((committed.query_snapshot as { startRow: number }).startRow).toBe(0);

    await db
      .updateTable('integration_sync_runs')
      .set({ available_at: new Date(Date.now() - 1000) })
      .where('id', '=', runId)
      .execute();
    expect(await worker.runOnce()).toBe(true);
    const finished = await db
      .selectFrom('integration_sync_runs')
      .select('status')
      .where('id', '=', runId)
      .executeTakeFirstOrThrow();
    expect(finished.status).toBe('succeeded');
    expect(offsets).toEqual([0, 2, 2]);
    const pages = await db
      .selectFrom('integration_import_artifacts')
      .select(['query_snapshot', 'row_count'])
      .where('sync_run_id', '=', runId)
      .where('dataset', '=', firstDataset.dataset)
      .execute();
    const pageSummary = pages
      .map((page) => ({
        offset: (page.query_snapshot as { startRow: number }).startRow,
        rowCount: page.row_count,
      }))
      .sort((left, right) => left.offset - right.offset);
    expect(pageSummary).toEqual([
      { offset: 0, rowCount: 2 },
      { offset: 2, rowCount: 1 },
    ]);
    const metrics = await db
      .selectFrom('integration_metric_rows as metric')
      .innerJoin(
        'integration_import_artifacts as artifact',
        'artifact.id',
        'metric.source_artifact_id',
      )
      .select(['metric.source_artifact_id'])
      .where('artifact.sync_run_id', '=', runId)
      .where('artifact.dataset', '=', firstDataset.dataset)
      .execute();
    expect(metrics).toHaveLength(3);
  });
});
