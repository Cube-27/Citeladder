/**
 * The TypeScript analytics worker against real PostgreSQL: the referral chain
 * from a queued ingest to persisted snapshots, workspace isolation of the
 * artifact it reads, the retention horizon, and the terminal accounting of
 * the one finalize (retry, exhaustion, not wired, cancelled, lost lease).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadWorkerSettings, policy } from '../src/config.ts';
import type { QueueTask } from '../src/queue/task-queue.ts';
import { AnalyticsWorker, EXECUTORS } from '../src/workers/analytics-worker.ts';
import type { Executor } from '../src/workers/executor.ts';
import {
  enqueue,
  REFERRER_DAILY,
  seedImport,
  seedMetricRow,
  seedProject,
  SOURCE_MEDIUM_DAILY,
} from './referral-fixtures.ts';
import { Fixtures, testDatabase } from './support.ts';

const db = testDatabase();
const fixtures = new Fixtures(db);
const settings = loadWorkerSettings({});
let workspaceId: string;
let otherWorkspaceId: string;
let projectId: string;

const WINDOW: [string, string] = ['2026-07-20', '2026-07-22'];

let owner: string;

beforeAll(async () => {
  owner = await fixtures.user();
});

beforeEach(async () => {
  // Every TypeScript-owned task in this disposable database belongs to this file.
  await db
    .deleteFrom('analytics_tasks')
    .where('task_kind', 'in', policy.analytics.ts_owned_task_kinds)
    .execute();
  // Grants and property mappings are unique per workspace: one per test.
  workspaceId = await fixtures.ownedWorkspace(owner);
  otherWorkspaceId = await fixtures.ownedWorkspace(owner);
  projectId = await seedProject(db, workspaceId);
});

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

const tasks = (kind: string) =>
  db
    .selectFrom('analytics_tasks')
    .selectAll()
    .where('task_kind', '=', kind)
    .where('project_id', '=', projectId)
    .execute();

const worker = (executors?: Record<string, Executor>) =>
  new AnalyticsWorker(db, settings, { owner: 'worker-test', executors });

describe('referral chain', () => {
  it('ingests, classifies and projects one import end to end', async () => {
    const seed = await seedImport(db, {
      workspaceId,
      projectId,
      dataset: SOURCE_MEDIUM_DAILY,
      window: WINDOW,
    });
    await seedMetricRow(db, seed, {
      date: '2026-07-20',
      values: ['chatgpt.com', 'referral', '20260720'],
      sessions: 5,
    });
    await seedMetricRow(db, seed, {
      date: '2026-07-21',
      values: ['google', 'organic', '20260721'],
      sessions: 3,
    });
    await enqueue(db, {
      workspaceId,
      projectId,
      kind: 'ingest_referrals',
      payload: { import_artifact_id: seed.artifactId },
    });

    // ingest -> classify -> ai_referrals_snapshot_refresh.
    expect(await worker().runUntilIdle()).toBe(3);

    const classifications = await db
      .selectFrom('referral_classifications')
      .innerJoin(
        'referral_events',
        'referral_events.id',
        'referral_classifications.referral_event_id',
      )
      .select(['referral_events.utm_source', 'ai_source', 'is_ai_referral', 'rule_version'])
      .where('referral_classifications.project_id', '=', projectId)
      .orderBy('referral_events.utm_source')
      .execute();
    expect(classifications).toEqual([
      {
        utm_source: 'chatgpt.com',
        ai_source: 'chatgpt',
        is_ai_referral: true,
        rule_version: policy.referrals.rule_version,
      },
      {
        utm_source: 'google',
        ai_source: 'other',
        is_ai_referral: false,
        rule_version: policy.referrals.rule_version,
      },
    ]);
    const [refresh] = await tasks('ai_referrals_snapshot_refresh');
    expect(refresh?.status).toBe('succeeded');
    expect(refresh?.idempotency_key.endsWith(`:${seed.syncRunId}`)).toBe(true);

    const snapshot = await db
      .selectFrom('ai_referrals_snapshots')
      .select(['metrics', 'preset_window_days'])
      .where('project_id', '=', projectId)
      .where('granularity', '=', 'day')
      .where('preset_window_days', 'is', null)
      .executeTakeFirstOrThrow();
    expect(snapshot.metrics).toEqual({
      referral_volume: [
        { date: '2026-07-20', value: 5 },
        { date: '2026-07-21', value: 0 },
        { date: '2026-07-22', value: null },
      ],
      referral_share: [
        { date: '2026-07-20', value: 1 },
        { date: '2026-07-21', value: 0 },
        { date: '2026-07-22', value: null },
      ],
      sources: [{ ai_source: 'chatgpt', sessions: 5, share: 0.625 }],
    });
    // The sync window at three granularities plus the 30/90/365-day family.
    const presets = await db
      .selectFrom('ai_referrals_snapshots')
      .select('preset_window_days')
      .where('project_id', '=', projectId)
      .where('preset_window_days', 'is not', null)
      .orderBy('preset_window_days')
      .execute();
    expect(presets.map((row) => row.preset_window_days)).toEqual(
      policy.analytics.snapshot_window_days,
    );
  });

  it('re-fires the chain for a re-sync and folds only the latest revision', async () => {
    const first = await seedImport(db, {
      workspaceId,
      projectId,
      dataset: SOURCE_MEDIUM_DAILY,
      window: WINDOW,
    });
    await seedMetricRow(db, first, {
      date: '2026-07-20',
      values: ['claude.ai', 'referral', '20260720'],
      sessions: 2,
    });
    await enqueue(db, {
      workspaceId,
      projectId,
      kind: 'ingest_referrals',
      payload: { import_artifact_id: first.artifactId },
    });
    expect(await worker().runUntilIdle()).toBe(3);

    const second = await seedImport(db, {
      workspaceId,
      projectId,
      dataset: SOURCE_MEDIUM_DAILY,
      window: WINDOW,
      resyncSeq: 1,
      previous: first,
    });
    await seedMetricRow(db, second, {
      date: '2026-07-20',
      values: ['claude.ai', 'referral', '20260720'],
      sessions: 9,
      resyncSeq: 1,
    });
    await enqueue(db, {
      workspaceId,
      projectId,
      kind: 'ingest_referrals',
      payload: { import_artifact_id: second.artifactId },
    });
    expect(await worker().runUntilIdle()).toBe(3);

    expect((await tasks('ai_referrals_snapshot_refresh')).map((row) => row.status)).toEqual([
      'succeeded',
      'succeeded',
    ]);
    const snapshot = await db
      .selectFrom('ai_referrals_snapshots')
      .select('metrics')
      .where('project_id', '=', projectId)
      .where('granularity', '=', 'day')
      .where('preset_window_days', 'is', null)
      .executeTakeFirstOrThrow();
    expect((snapshot.metrics as { sources: unknown }).sources).toEqual([
      { ai_source: 'claude', sessions: 9, share: 1 },
    ]);
  });

  it('dedupes a re-run of the same artifact into no new events', async () => {
    const seed = await seedImport(db, {
      workspaceId,
      projectId,
      dataset: REFERRER_DAILY,
      window: WINDOW,
    });
    await seedMetricRow(db, seed, {
      date: '2026-07-20',
      values: ['https://chatgpt.com/c/1?secret=x', '20260720'],
      sessions: 1,
    });
    for (let run = 0; run < 2; run += 1) {
      await enqueue(db, {
        workspaceId,
        projectId,
        kind: 'ingest_referrals',
        payload: { import_artifact_id: seed.artifactId },
      });
      await worker().runUntilIdle();
    }
    const events = await db
      .selectFrom('referral_events')
      .select(['referrer_url', 'referrer_host'])
      .where('import_id', '=', seed.artifactId)
      .execute();
    expect(events).toEqual([
      { referrer_url: 'https://chatgpt.com/c/1', referrer_host: 'chatgpt.com' },
    ]);
  });

  it('never ingests another workspace’s artifact', async () => {
    const foreignProject = await seedProject(db, otherWorkspaceId);
    const foreign = await seedImport(db, {
      workspaceId: otherWorkspaceId,
      projectId: foreignProject,
      dataset: REFERRER_DAILY,
      window: WINDOW,
    });
    await seedMetricRow(db, foreign, {
      date: '2026-07-20',
      values: ['https://claude.ai/', '20260720'],
      sessions: 1,
    });
    await enqueue(db, {
      workspaceId,
      projectId,
      kind: 'ingest_referrals',
      payload: { import_artifact_id: foreign.artifactId },
    });

    await worker().runUntilIdle();

    const [task] = await tasks('ingest_referrals');
    expect(task).toMatchObject({ status: 'retry_wait', error_code: 'unknown', attempt_count: 1 });
    const events = await db
      .selectFrom('referral_events')
      .select('id')
      .where('import_id', '=', foreign.artifactId)
      .execute();
    expect(events).toEqual([]);
  });
});

describe('referral retention sweep', () => {
  it('deletes only this workspace’s referrals past the horizon', async () => {
    const seed = await seedImport(db, {
      workspaceId,
      projectId,
      dataset: REFERRER_DAILY,
      window: WINDOW,
    });
    const old = new Date(Date.now() - (policy.referrals.retention_days + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const recent = new Date().toISOString().slice(0, 10);
    await seedMetricRow(db, seed, {
      date: old,
      values: ['https://chatgpt.com/', old.replaceAll('-', '')],
      sessions: 1,
    });
    await seedMetricRow(db, seed, {
      date: recent,
      values: ['https://claude.ai/', recent.replaceAll('-', '')],
      sessions: 1,
    });
    await enqueue(db, {
      workspaceId,
      projectId,
      kind: 'ingest_referrals',
      payload: { import_artifact_id: seed.artifactId },
    });
    await worker().runUntilIdle();

    await enqueue(db, {
      workspaceId,
      projectId: null,
      kind: 'referral_retention_sweep',
      payload: { sweep_key: recent },
    });
    expect(await worker().runUntilIdle()).toBe(1);

    const kept = await db
      .selectFrom('referral_events')
      .leftJoin(
        'referral_classifications',
        'referral_classifications.referral_event_id',
        'referral_events.id',
      )
      .select(['referral_events.referrer_host', 'referral_classifications.ai_source'])
      .where('referral_events.import_id', '=', seed.artifactId)
      .execute();
    expect(kept).toEqual([{ referrer_host: 'claude.ai', ai_source: 'claude' }]);
  });
});

describe('finalize', () => {
  const failing: Executor = async () => {
    throw new Error('projection failed');
  };

  async function runOne(executors: Record<string, Executor>): Promise<QueueTask> {
    const id = await enqueue(db, { workspaceId, projectId, kind: 'ingest_referrals', payload: {} });
    await worker(executors).runOnce();
    return db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  }

  it('retries a failed attempt, then fails it at the attempt budget', async () => {
    const retried = await runOne({ ingest_referrals: failing });
    expect(retried).toMatchObject({
      status: 'retry_wait',
      attempt_count: 1,
      error_code: policy.analytics.retry_error,
      error_detail: 'projection failed',
      lease_owner: null,
    });

    await db
      .updateTable('analytics_tasks')
      .set({ attempt_count: retried.max_attempts - 1, status: 'queued', available_at: new Date(0) })
      .where('id', '=', retried.id)
      .execute();
    await worker({ ingest_referrals: failing }).runOnce();
    const exhausted = await db
      .selectFrom('analytics_tasks')
      .selectAll()
      .where('id', '=', retried.id)
      .executeTakeFirstOrThrow();
    expect(exhausted).toMatchObject({
      status: 'failed',
      error_code: policy.task_queue.max_attempts_error,
    });
    expect(exhausted.completed_at).not.toBeNull();
  });

  it('fails a kind with no executor without retrying it', async () => {
    const { ingest_referrals: _removed, ...rest } = EXECUTORS;
    expect(await runOne(rest)).toMatchObject({
      status: 'failed',
      attempt_count: 1,
      error_code: policy.analytics.executor_not_wired_error,
    });
  });

  it('writes nothing for a row cancelled mid-run', async () => {
    const cancelling: Executor = async (task, context) => {
      await db
        .updateTable('analytics_tasks')
        .set({ status: 'cancelled' })
        .where('id', '=', task.id)
        .execute();
      await context.checkCancelled('batch');
    };
    expect(await runOne({ ingest_referrals: cancelling })).toMatchObject({
      status: 'cancelled',
      attempt_count: 0,
    });
  });

  it('writes nothing once the lease moved to another owner', async () => {
    const stolen: Executor = async (task) => {
      await db
        .updateTable('analytics_tasks')
        .set({ lease_owner: 'sweeper-reclaimed' })
        .where('id', '=', task.id)
        .execute();
    };
    expect(await runOne({ ingest_referrals: stolen })).toMatchObject({
      status: 'running',
      lease_owner: 'sweeper-reclaimed',
      attempt_count: 0,
    });
  });
});
