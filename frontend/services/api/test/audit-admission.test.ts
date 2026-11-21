import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { setLogSink } from '../src/logging.ts';
import { createAudits } from '../src/audits/creation.ts';
import { appendCostProjection } from '../src/audits/costs.ts';
import { capacityLock } from '../src/entitlements/ledger.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { record } from '../src/db/json.ts';
import { lockProjectRow, removeProject } from '../src/projects/service.ts';
import { asOwner, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { auditTenant, managedPlan } from './audit-fixtures.ts';
import providers from '../src/config/providers.json' with { type: 'json' };

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const runtime = auditRuntime({});
afterEach(async () => {
  await fixtures.cleanup();
});
afterAll(async () => {
  await db.destroy();
});
function input(t: Awaited<ReturnType<typeof auditTenant>>) {
  return auditInput.parse({
    project_id: t.projectId,
    prompt_set_id: t.setId,
    engines: ['chatgpt'],
    random_seed: '42',
  });
}
async function queued(workspaceId: string) {
  return db.selectFrom('audits').selectAll().where('workspace_id', '=', workspaceId).execute();
}
async function managedTenant() {
  const t = await auditTenant(db, fixtures),
    platform = await auditTenant(db, fixtures);
  await db
    .updateTable('provider_connections')
    .set({ active: false })
    .where('id', '=', t.connectionId)
    .execute();
  await db
    .updateTable('workspaces')
    .set({ is_system: true })
    .where('id', '=', platform.workspaceId)
    .execute();
  await db
    .updateTable('provider_connections')
    .set({
      credential_source: 'platform',
      api_key_encrypted: '',
      platform_credential_ref: 'test-platform',
    })
    .where('id', '=', platform.connectionId)
    .execute();
  return { t, accountId: await managedPlan(db, t.workspaceId) };
}
async function recordSpend(
  t: Awaited<ReturnType<typeof auditTenant>>,
  accountId: string,
  costs: number[],
  projectId = t.projectId,
) {
  const spentAudit = await fixtures.audit({ ...t, projectId });
  const { taskId } = await fixtures.execution({ ...t, projectId }, { auditId: spentAudit });
  const artifact = await db
    .selectFrom('raw_response_artifacts')
    .select(['id', 'logical_engine', 'transport_provider', 'transport_model'])
    .where('task_id', '=', taskId)
    .executeTakeFirstOrThrow();
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  await db
    .updateTable('audits')
    .set({ funding_account_id: accountId, funded_budget_period_start: month })
    .where('id', '=', spentAudit)
    .execute();
  for (const [version, cost] of costs.entries())
    await db
      .insertInto('execution_cost_projections')
      .values({
        id: randomUUID(),
        workspace_id: t.workspaceId,
        audit_id: spentAudit,
        task_id: taskId,
        raw_response_artifact_id: artifact.id,
        logical_engine: artifact.logical_engine,
        transport_provider: artifact.transport_provider,
        transport_model: artifact.transport_model,
        funded_budget_period_start: month,
        pricing_version: `fixture-${version}`,
        formula_version: 'fixture',
        projection_status: 'complete',
        projected_total_cost_microusd: cost,
        created_at: new Date(now.getTime() + version * 1000),
      })
      .execute();
}
describe('atomic audit admission', () => {
  it('rejects unshipped catalog engines before persisting an audit', async () => {
    const t = await auditTenant(db, fixtures);
    vi.resetModules();
    vi.doMock('../src/config/providers.json', () => ({
      default: {
        ...providers,
        catalog: providers.catalog.map((row) =>
          row.key === 'chatgpt' ? { ...row, adapter_shipped: false } : row,
        ),
      },
    }));
    try {
      const { createAudits: createWithoutAdapter } = await import('../src/audits/creation.ts');
      const { scheduleCreate } = await import('../src/audits/schedule-inputs.ts');
      await expect(
        createWithoutAdapter(db, t.workspaceId, input(t), {}, runtime),
      ).rejects.toMatchObject({ status: 400, message: 'An engine is unavailable' });
      expect(
        scheduleCreate.safeParse({ prompt_set_id: t.setId, cadence: 'daily', engines: ['chatgpt'] })
          .success,
      ).toBe(false);
    } finally {
      vi.doUnmock('../src/config/providers.json');
      vi.resetModules();
    }
    expect(await queued(t.workspaceId)).toEqual([]);
  });
  it.each([
    'AUDIT_WORKER_CONCURRENCY',
    'AUDIT_POLL_INTERVAL_SECONDS',
    'AUDIT_LEASE_TTL_SECONDS',
    'AUDIT_MAX_ATTEMPTS',
  ])('refuses zero execution bound %s', (name) => {
    expect(() => auditRuntime({ [name]: '0' })).toThrow();
  });
  it('permits disabled jitter while refusing inconsistent heartbeat and retry bounds', () => {
    expect(auditRuntime({ AUDIT_RETRY_JITTER_SECONDS: '0' }).audits.retry_jitter_seconds).toBe(0);
    expect(() => auditRuntime({ AUDIT_HEARTBEAT_INTERVAL_SECONDS: '120' })).toThrow('heartbeat');
    expect(() => auditRuntime({ AUDIT_RETRY_BASE_DELAY_SECONDS: '46' })).toThrow('retry');
  });
  it('measures a managed workspace on platform keys and refuses it once recorded spend reaches the budget', async () => {
    const { t, accountId } = await managedTenant();
    const logs: string[] = [],
      prior = setLogSink((line) => logs.push(line));
    try {
      const fundedRuntime = {
        ...runtime,
        fundedBudgetMinor: 1,
        audits: { ...runtime.audits, audit_prompt_count: 10 },
      };
      const request = input(t);
      const [id] = await createAudits(db, t.workspaceId, request, {}, fundedRuntime);
      const tasks = await db
        .selectFrom('audit_tasks')
        .selectAll()
        .where('audit_id', '=', id)
        .execute();
      const holds = await db
        .selectFrom('consumable_ledger')
        .selectAll()
        .where('workspace_id', '=', t.workspaceId)
        .where('entry_kind', '=', 'reservation')
        .execute();
      expect(holds).toHaveLength(tasks.length);
      expect(
        tasks.every(
          (task) => record(task.provider_route_snapshot).credential_source === 'platform',
        ),
      ).toBe(true);
      expect(holds.reduce((sum, hold) => sum + hold.units, 0)).toBe(tasks.length);
      await recordSpend(t, accountId, [10_000]);
      const before = (await queued(t.workspaceId)).length;
      await expect(
        createAudits(db, t.workspaceId, request, {}, fundedRuntime),
      ).rejects.toMatchObject({ code: 'funded_budget_exhausted' });
      expect(await queued(t.workspaceId)).toHaveLength(before);
      expect(
        logs
          .map((line) => JSON.parse(line))
          .some(
            (event) =>
              event.event === 'billing.funded_budget_exhausted' && event.account_id === accountId,
          ),
      ).toBe(true);
    } finally {
      setLogSink(prior);
      await asOwner((owner) =>
        owner.deleteFrom('consumable_ledger').where('workspace_id', '=', t.workspaceId).execute(),
      );
    }
  });
  it('counts only the latest projection of a repriced execution toward the funded month', async () => {
    const { t, accountId } = await managedTenant();
    await recordSpend(t, accountId, [15_000, 12_000]);
    try {
      const fundedRuntime = {
        ...runtime,
        fundedBudgetMinor: 2,
        audits: { ...runtime.audits, audit_prompt_count: 10 },
      };
      expect(await createAudits(db, t.workspaceId, input(t), {}, fundedRuntime)).toHaveLength(1);
      await recordSpend(t, accountId, [9_000]);
      await expect(
        createAudits(db, t.workspaceId, input(t), {}, fundedRuntime),
      ).rejects.toMatchObject({ code: 'funded_budget_exhausted' });
    } finally {
      await asOwner((owner) =>
        owner.deleteFrom('consumable_ledger').where('workspace_id', '=', t.workspaceId).execute(),
      );
    }
  });
  it("keeps a deleted project's recorded spend in the funded month", async () => {
    const { t, accountId } = await managedTenant();
    const deleted = await fixtures.project(t.workspaceId);
    await recordSpend(t, accountId, [10_000], deleted);
    await removeProject(db, { workspaceId: t.workspaceId, projectId: deleted });
    const fundedRuntime = {
      ...runtime,
      fundedBudgetMinor: 1,
      audits: { ...runtime.audits, audit_prompt_count: 10 },
    };
    await expect(
      createAudits(db, t.workspaceId, input(t), {}, fundedRuntime),
    ).rejects.toMatchObject({ code: 'funded_budget_exhausted' });
    expect(await queued(t.workspaceId)).toEqual([]);
  });
  it("prices a funded answer into its audit's budget month, and a self-funded one into none", async () => {
    const t = await auditTenant(db, fixtures);
    const account = await billingAccount(db, t.workspaceId);
    const month = new Date('2030-04-01T00:00:00Z');
    const priced = async (funded: boolean) => {
      const auditId = await fixtures.audit(t);
      if (funded)
        await db
          .updateTable('audits')
          .set({ funding_account_id: account, funded_budget_period_start: month })
          .where('workspace_id', '=', t.workspaceId)
          .where('id', '=', auditId)
          .execute();
      const { taskId } = await fixtures.execution(t, { auditId });
      const artifact = await db
        .selectFrom('raw_response_artifacts')
        .select('id')
        .where('task_id', '=', taskId)
        .executeTakeFirstOrThrow();
      const projection = await db
        .transaction()
        .execute((trx) => appendCostProjection(trx, t.workspaceId, artifact.id));
      return projection?.funded_budget_period_start;
    };
    expect([await priced(true), await priced(false)]).toEqual([month, null]);
  });
  it('persists replayable slots, immutable snapshots, credential identity and queue events together', async () => {
    const t = await auditTenant(db, fixtures);
    const [id] = await createAudits(db, t.workspaceId, input(t), {}, runtime);
    const audit = (await queued(t.workspaceId))[0]!;
    expect(audit).toMatchObject({
      id,
      status: 'queued',
      requested_count: 3,
      random_seed: '42',
      funding_account_id: null,
    });
    const tasks = await db
      .selectFrom('audit_tasks')
      .selectAll()
      .where('audit_id', '=', id)
      .orderBy('randomized_position')
      .execute();
    expect(new Set(tasks.map((task) => task.repetition)).size).toBe(3);
    expect(tasks.every((task) => task.status === 'queued' && task.attempt_count === 0)).toBe(true);
    expect(record(tasks[0]?.provider_route_snapshot)).toMatchObject({
      credential_source: 'byok',
      connection_id: t.connectionId,
      reservation_id: expect.any(String),
      retrieval_enabled: true,
    });
    await db
      .updateTable('prompts')
      .set({ text: 'Changed later' })
      .where('id', '=', t.promptId)
      .execute();
    const snapshot = await db
      .selectFrom('audit_prompt_snapshots')
      .select('text')
      .where('audit_id', '=', id)
      .executeTakeFirstOrThrow();
    expect(snapshot.text).toBe('Which running shoes suit road use?');
    const events = await db
      .selectFrom('audit_events')
      .select(['event_type', 'payload'])
      .where('audit_id', '=', id)
      .execute();
    expect(
      events
        .filter((event) => event.event_type === 'audit.status')
        .map((event) => record(event.payload).status)
        .sort(),
    ).toEqual(['queued', 'validating']);
  });
  it('serializes concurrent launches at the workspace capacity boundary', async () => {
    const t = await auditTenant(db, fixtures);
    const outcomes = await Promise.allSettled(
      [1, 2].map(() =>
        createAudits(db, t.workspaceId, input(t), {}, { ...runtime, activeLimit: 1 }),
      ),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { status: 429 },
    });
    expect(await queued(t.workspaceId)).toHaveLength(1);
    const windows = await db
      .selectFrom('usage_windows')
      .select('count')
      .where('operation', '=', 'audit.provider_tasks')
      .where('subject_hash', '=', createHash('sha256').update(t.workspaceId).digest('hex'))
      .execute();
    expect(windows[0]?.count).toBe(3);
  });
  it('serializes the rolling manual rate under the linked account lock', async () => {
    const t = await auditTenant(db, fixtures);
    const accountId = await billingAccount(db, t.workspaceId);
    await grant(db, accountId, { key: 'manual_runs_per_day', value: 1, sourceKind: 'override' });
    const outcomes = await Promise.allSettled(
      [1, 2].map(() => createAudits(db, t.workspaceId, input(t), {}, runtime)),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'manual_run_rate_exceeded' },
    });
    expect(await queued(t.workspaceId)).toHaveLength(1);
  });
  it('waits behind a project deletion instead of deadlocking on the account capacity lock', async () => {
    const t = await auditTenant(db, fixtures);
    const accountId = await billingAccount(db, t.workspaceId);
    await grant(db, accountId, { key: 'manual_runs_per_day', value: 1, sourceKind: 'override' });
    const deletion = await db.startTransaction().execute();
    let launch: Promise<string[]> | undefined;
    try {
      await lockProjectRow(deletion, { workspaceId: t.workspaceId, projectId: t.projectId });
      const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(deletion);
      launch = createAudits(db, t.workspaceId, input(t), {}, runtime);
      await vi.waitFor(
        async () => {
          const blocked = await sql<{ waiting: boolean }>`select exists (
            select 1 from pg_stat_activity where ${rows[0]!.pid} = any(pg_blocking_pids(pid))
          ) as waiting`.execute(db);
          expect(blocked.rows[0]!.waiting).toBe(true);
        },
        { timeout: 5000, interval: 20 },
      );
      await capacityLock(deletion, accountId);
      await deletion.rollback().execute();
      expect(await launch).toHaveLength(1);
      expect(await queued(t.workspaceId)).toHaveLength(1);
    } finally {
      if (!deletion.isRolledBack) await deletion.rollback().execute();
      await launch?.catch(() => undefined);
    }
  });
  it('refuses a BYOK launch once its prompt runs are spent, queuing nothing', async () => {
    const t = await auditTenant(db, fixtures);
    await grant(db, await billingAccount(db, t.workspaceId), {
      key: 'prompt_runs_per_period',
      value: 2,
    });
    await expect(createAudits(db, t.workspaceId, input(t), {}, runtime)).rejects.toMatchObject({
      status: 403,
      code: 'prompt_runs_exhausted',
    });
    expect(await queued(t.workspaceId)).toEqual([]);
  });
  it('rejects a foreign project before consuming admission capacity', async () => {
    const t = await auditTenant(db, fixtures),
      foreign = await auditTenant(db, fixtures);
    await expect(
      createAudits(db, foreign.workspaceId, input(t), {}, runtime),
    ).rejects.toMatchObject({ status: 404 });
    expect(await queued(foreign.workspaceId)).toEqual([]);
  });
});
