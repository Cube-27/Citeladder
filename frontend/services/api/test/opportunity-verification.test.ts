import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { loadWorkerSettings, policy } from '../src/config.ts';
import { verifyImplementationEvents } from '../src/opportunities/verification.ts';
import { enqueueImplementationVerification } from '../src/opportunities/enqueue.ts';
import {
  buildVerificationResult,
  type Declaration,
} from '../src/opportunities/verification-result.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import type { QueueTask } from '../src/queue/task-queue.ts';
import type { Json } from '../src/generated/db-schema.ts';
import { testDatabase } from './support.ts';
import { sql } from 'kysely';
// Each Python fixture call starts an interpreter.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const db = testDatabase();
type Seed = {
  workspaceId: string;
  projectId: string;
  userId: string;
  auditId: string;
  metricId: string;
  crawlId: string;
  trafficId: string;
  snapshotId: string;
  analysisId: string;
  artifactId: string;
  ruleId: string;
  declarations: Record<string, string>;
};
const seeds: Seed[] = [];
async function python(phase: string, workspace = '') {
  const backend = fileURLToPath(new URL('../../../../backend/', import.meta.url));
  const executable = fileURLToPath(
    new URL(
      process.platform === 'win32'
        ? '../../../../backend/.venv/Scripts/python.exe'
        : '../../../../backend/.venv/bin/python',
      import.meta.url,
    ),
  );
  const system = Object.fromEntries(
    ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME'].flatMap((k) =>
      process.env[k] ? [[k, process.env[k]!]] : [],
    ),
  );
  const { stdout } = await promisify(execFile)(
    executable,
    [fileURLToPath(new URL('./verification-fixture.py', import.meta.url)), phase, workspace],
    {
      cwd: backend,
      env: {
        ...system,
        PYTHONPATH: backend,
        CITELADDER_DISABLE_DOTENV: '1',
        APP_ENV: 'test',
        DATABASE_URL: process.env.API_TEST_DATABASE_URL!.replace(
          'postgresql://',
          'postgresql+asyncpg://',
        ),
        JWT_SECRET_KEY: 'pr6-test-jwt-key-not-a-real-secret-123',
        ENCRYPTION_KEY: 'pr6-test-encryption-key-not-a-real-secret',
        REFERRAL_HASH_SALT: 'pr6-test-referral-salt-not-a-real-secret',
      },
    },
  );
  return JSON.parse(stdout.trim().split('\n').at(-1)!) as unknown;
}
let own: Seed;
let foreign: Seed;
let taskTemplate: QueueTask;
async function seed() {
  const created = (await python('seed')) as Seed;
  seeds.push(created);
  await db.transaction().execute(async (trx) => {
    for (const [triggerKind, triggerId] of [
      ['site_crawl', created.crawlId],
      ['audit', created.auditId],
      ['traffic_snapshot', created.trafficId],
      ['source_page_inspection', created.auditId],
    ]) {
      await enqueueImplementationVerification(trx, {
        workspaceId: created.workspaceId,
        projectId: created.projectId,
        triggerKind: triggerKind!,
        triggerId: triggerId!,
        maxAttempts: loadWorkerSettings({}).taskMaxAttempts,
      });
    }
  });
  return created;
}
beforeAll(async () => {
  own = await seed();
  foreign = await seed();
  taskTemplate = await db
    .selectFrom('analytics_tasks')
    .selectAll()
    .where('workspace_id', '=', own.workspaceId)
    .executeTakeFirstOrThrow();
  await new AnalyticsWorker(db, loadWorkerSettings({}), {
    owner: `pr6-${randomUUID()}`,
  }).runUntilIdle();
});
afterAll(async () => {
  for (const seed of seeds) {
    await db.deleteFrom('workspaces').where('id', '=', seed.workspaceId).execute();
    await db.deleteFrom('users').where('id', '=', seed.userId).execute();
  }
  await db.destroy();
});
const context = { db, checkCancelled: async () => {}, maxAttempts: 3 };
const task = (seed: Seed, kind = 'site_crawl', id = seed.crawlId): QueueTask => ({
  ...taskTemplate,
  workspace_id: seed.workspaceId,
  project_id: seed.projectId,
  task_kind: 'opportunity_verification',
  payload: { trigger_kind: kind, trigger_id: id },
});
async function declaration(id: string): Promise<Declaration> {
  const row = await db
    .selectFrom('opportunity_implementation_events')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return {
    ...row,
    created_at: row.created_at.toISOString(),
    declared_implemented_at: row.declared_implemented_at.toISOString(),
  };
}
it('TS claims every verification trigger and model reads retain append-only results', async () => {
  const tasks = await db
    .selectFrom('analytics_tasks')
    .select(['status', 'error_detail'])
    .where('workspace_id', '=', own.workspaceId)
    .execute();
  expect(tasks).toHaveLength(4);
  expect(
    tasks.every((t) => t.status === 'succeeded'),
    JSON.stringify(tasks),
  ).toBe(true);
  const rows = (await python('read', own.workspaceId)) as {
    declaration: string;
    kind: string;
    result: { placement: { state: string } | null; legs: Record<string, unknown> };
    key: string;
  }[];
  expect(rows).toHaveLength(4);
  expect(rows.map((r) => r.declaration)).not.toContain(own.declarations.missing_prompt);
  expect(rows.every((r) => r.kind === 'verified')).toBe(true);
  const placement = rows.find((r) => r.declaration === own.declarations.placement)!;
  expect(placement.result.placement?.state).toBe('satisfied');
  expect(placement.result.legs).not.toHaveProperty('placement');
  const keys = rows.map((r) => r.key).sort();
  await Promise.all([
    verifyImplementationEvents(task(own), context),
    verifyImplementationEvents(task(own), context),
  ]);
  const replay = await db
    .selectFrom('opportunity_verification_events')
    .select('idempotency_key')
    .where('workspace_id', '=', own.workspaceId)
    .execute();
  expect(replay.map((r) => r.idempotency_key).sort()).toEqual(keys);
  const site = await db
    .selectFrom('opportunity_verification_events')
    .selectAll()
    .where('implementation_event_id', '=', own.declarations.site!)
    .executeTakeFirstOrThrow();
  expect(site.source_analysis_ids).toEqual([own.analysisId]);
  expect(site.source_rule_evaluation_ids).toEqual([own.ruleId]);
  expect(site.idempotency_key).toContain(':1790503200123456:');
  expect(site.idempotency_key).toMatch(/:implementation-verifier-1$/);
});
it('rejects foreign trigger IDs and refuses foreign snapshot provenance', async () => {
  await expect(
    verifyImplementationEvents(task(own, 'site_crawl', foreign.crawlId), context),
  ).rejects.toThrow('not terminal');
  await expect(
    verifyImplementationEvents({ ...task(own), project_id: foreign.projectId }, context),
  ).rejects.toThrow('outside its workspace');
  const d = await declaration(own.declarations.site!);
  const result = await buildVerificationResult(
    db,
    { ...d, opportunity_snapshot_id: foreign.snapshotId },
    null,
  );
  expect(result.state).toBe('unavailable');
  expect(result.legs).toEqual({});
  const scoped = await buildVerificationResult(db, d, foreign.auditId);
  expect(scoped.legs.visibility?.state).toBe('unavailable');
  const foreignBefore = await db
    .selectFrom('opportunity_verification_events')
    .select('id')
    .where('workspace_id', '=', foreign.workspaceId)
    .execute();
  await verifyImplementationEvents(task(own), context);
  expect(
    await db
      .selectFrom('opportunity_verification_events')
      .select('id')
      .where('workspace_id', '=', foreign.workspaceId)
      .execute(),
  ).toEqual(foreignBefore);
});
it('requires current finalized site evidence and scopes referenced rule rows', async () => {
  const original = await db
    .selectFrom('site_page_analyses')
    .selectAll()
    .where('id', '=', own.analysisId)
    .executeTakeFirstOrThrow();
  const before = await db
    .selectFrom('opportunity_verification_events')
    .select('id')
    .where('workspace_id', '=', own.workspaceId)
    .execute();
  try {
    const { evidenceFor } = await import('../src/opportunities/verification-evidence.ts');
    await db
      .updateTable('site_page_analyses')
      .set({ finalized_at: null })
      .where('id', '=', own.analysisId)
      .execute();
    const d = await declaration(own.declarations.site!);
    const evidence = () =>
      evidenceFor(db, d, {
        kind: 'site_crawl',
        id: own.crawlId,
        observed_at: '2026-09-27T10:00:00.123456Z',
      });
    expect((await evidence()).observed).toBe(0);
    await db
      .updateTable('site_page_analyses')
      .set({ finalized_at: original.finalized_at, is_current: false })
      .where('id', '=', own.analysisId)
      .execute();
    expect((await evidence()).observed).toBe(0);
    await db
      .updateTable('site_page_analyses')
      .set({ is_current: original.is_current })
      .where('id', '=', own.analysisId)
      .execute();
    await verifyImplementationEvents(task(own), context);
    expect(
      await db
        .selectFrom('opportunity_verification_events')
        .select('id')
        .where('workspace_id', '=', own.workspaceId)
        .execute(),
    ).toEqual(before);
    await db
      .updateTable('site_page_analyses')
      .set({ finalized_at: original.finalized_at, source_evaluation_ids: [foreign.ruleId] })
      .where('id', '=', own.analysisId)
      .execute();
    const scoped = await evidence();
    expect(scoped.observed).toBe(1);
    expect([...scoped.rule_evaluation_ids]).toEqual([]);
    expect(scoped.limitations).toContain('site_rule: no applicable evaluation');
  } finally {
    await db
      .updateTable('site_page_analyses')
      .set({
        finalized_at: original.finalized_at,
        is_current: original.is_current,
        source_evaluation_ids: original.source_evaluation_ids,
      })
      .where('id', '=', own.analysisId)
      .execute();
  }
});

it('compares scoped referral windows and frozen branded-demand sources without treating missing evidence as zero', async () => {
  const d = await declaration(own.declarations.site!);
  const scope = { workspace_id: own.workspaceId, project_id: own.projectId };
  const baselineTime = new Date('2026-09-25T00:00:00Z');
  const postTime = new Date('2026-09-27T12:00:00Z');
  const window = {
    window_start: baselineTime,
    window_end: postTime,
    analyzer_version: '1',
    formula_version: '1',
  };
  const before = randomUUID();
  const after = randomUUID();
  const read = () => buildVerificationResult(db, d, null);
  await db
    .insertInto('ai_referrals_snapshots')
    .values({
      ...scope,
      ...window,
      id: after,
      created_at: postTime,
      granularity: 'day',
      preset_window_days: null,
      metrics: sql`${JSON.stringify({ totals: { ai_referrals: 0 } })}::jsonb`,
      source_classification_ids: null,
    })
    .execute();
  expect((await read()).legs.ai_referral_traffic?.state).toBe('unavailable');
  await db
    .insertInto('ai_referrals_snapshots')
    .values({
      ...scope,
      ...window,
      id: before,
      created_at: baselineTime,
      granularity: 'week',
      preset_window_days: null,
      metrics: sql`${JSON.stringify({ totals: { ai_referrals: 10 } })}::jsonb`,
      source_classification_ids: null,
    })
    .execute();
  expect((await read()).legs.ai_referral_traffic?.state).toBe('non_comparable');
  await db
    .updateTable('ai_referrals_snapshots')
    .set({
      granularity: 'day',
      window_start: new Date('2026-09-22T00:00:00Z'),
      window_end: new Date('2026-09-24T12:00:00Z'),
    })
    .where('id', '=', before)
    .execute();
  expect((await read()).legs.ai_referral_traffic).toMatchObject({
    state: 'observed_zero',
    baseline_source_ids: [before],
    post_source_ids: [after],
    delta: -10,
  });
  const baselineDemand = randomUUID();
  const postDemand = randomUUID();
  const snapshot = {
    ...scope,
    ...window,
    comparison: null,
    coverage: sql<Json>`'{}'::jsonb`,
    prior_snapshot_id: null,
    source_artifact_ids: sql<Json>`'[]'::jsonb`,
    source_metric_row_ids: sql<Json>`'[]'::jsonb`,
    summary: sql<Json>`'{}'::jsonb`,
  };
  await db
    .insertInto('demand_snapshots')
    .values({
      ...snapshot,
      id: baselineDemand,
      created_at: baselineTime,
      source_hash: baselineDemand,
    })
    .execute();
  await db
    .updateTable('opportunity_snapshots')
    .set({ demand_snapshot_id: baselineDemand })
    .where('id', '=', own.snapshotId)
    .execute();
  expect((await read()).legs.branded_search_demand?.state).toBe('not_run');
  await db
    .insertInto('demand_snapshots')
    .values({ ...snapshot, id: postDemand, created_at: postTime, source_hash: postDemand })
    .execute();
  const signal = randomUUID();
  await db
    .insertInto('demand_signals')
    .values({
      ...scope,
      id: signal,
      snapshot_id: baselineDemand,
      signal_type: policy.demand.DEMAND_SIGNAL_BRANDED_QUERY,
      analyzer_version: '1',
      formula_version: '1',
      rule_version: '1',
      state: 'available',
      identity_hash: signal,
      created_at: baselineTime,
      metrics: sql`'{"impressions":42}'::jsonb`,
      coverage: sql`'{}'::jsonb`,
      evidence: sql`'{}'::jsonb`,
      limitations: sql`'[]'::jsonb`,
      page_url: '',
      topic_cluster: '',
      priority_inputs: sql`'{}'::jsonb`,
      priority_score: null,
    })
    .execute();
  expect((await read()).legs.branded_search_demand).toMatchObject({
    state: 'observed_zero',
    baseline_source_ids: [baselineDemand, signal],
    post_source_ids: [postDemand],
    delta: -42,
  });
  const foreignSnapshot = randomUUID();
  await db
    .insertInto('demand_snapshots')
    .values({
      ...snapshot,
      workspace_id: foreign.workspaceId,
      project_id: foreign.projectId,
      id: foreignSnapshot,
      created_at: baselineTime,
      source_hash: foreignSnapshot,
    })
    .execute();
  await db
    .updateTable('opportunity_snapshots')
    .set({ demand_snapshot_id: foreignSnapshot })
    .where('id', '=', own.snapshotId)
    .execute();
  expect((await read()).legs.branded_search_demand?.state).toBe('unavailable');
});
it('keeps baseline gaps unknown until a later snapshot and suppresses changed audit cohorts', async () => {
  const d = await declaration(own.declarations.site!);
  const result = await buildVerificationResult(db, d, own.auditId);
  expect(result.gap_changes).toEqual({
    no_longer_observed: [],
    persistent: [],
    new: [],
    state: 'not_run',
  });
  expect(result.legs.visibility?.state).toBe('available');
  const audit = await db
    .selectFrom('audits')
    .selectAll()
    .where('id', '=', own.auditId)
    .executeTakeFirstOrThrow();
  const different = randomUUID();
  await db
    .insertInto('audits')
    .values({ ...audit, id: different })
    .execute();
  expect((await buildVerificationResult(db, d, different)).legs.visibility?.state).toBe(
    'non_comparable',
  );
  // A foreign baseline audit must remain unavailable even when its ID exists.
  await db
    .updateTable('opportunity_snapshots')
    .set({ audit_id: foreign.auditId })
    .where('id', '=', own.snapshotId)
    .execute();
  try {
    expect((await buildVerificationResult(db, d, own.auditId)).legs.visibility?.state).toBe(
      'unavailable',
    );
  } finally {
    await db
      .updateTable('opportunity_snapshots')
      .set({ audit_id: own.auditId })
      .where('id', '=', own.snapshotId)
      .execute();
  }
});
it('keeps boolean page facts distinct from numeric expectations', async () => {
  const { evidenceFor } = await import('../src/opportunities/verification-evidence.ts');
  const d = await declaration(own.declarations.site!);
  const source = {
    kind: 'site_crawl',
    id: own.crawlId,
    observed_at: '2026-09-27T10:00:00.123456Z',
  };
  const inspect = (expected: boolean | number) =>
    evidenceFor(
      db,
      {
        ...d,
        expected_checks: [{ kind: 'page_fact', fact_key: 'secure', expected_value: expected }],
      },
      source,
    );
  expect(await inspect(true)).toMatchObject({ observed: 1, matched: 1, contradicted: false });
  expect(await inspect(1)).toMatchObject({ observed: 1, matched: 0, contradicted: true });
  const unspecified = await evidenceFor(
    db,
    { ...d, expected_checks: [{ kind: 'page_fact', fact_key: 'secure' }] },
    source,
  );
  expect(unspecified).toMatchObject({ observed: 0, matched: 0, contradicted: false });
  expect(unspecified.limitations).toContain('page_fact: no expected value');
});
