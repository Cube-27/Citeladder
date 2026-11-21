import { sql } from 'kysely';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { asOwner, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { auditTenant } from './audit-fixtures.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { createAudits } from '../src/audits/creation.ts';
import { AuditMaintenance, cancelAudit, repairOwnedCompletion } from '../src/audits/maintenance.ts';
import { auditProjections } from '../src/audits/projections.ts';
import { deriveExecution } from '../src/audits/derivation.ts';
import { persistExecutionSuccess, type ExecutionResult } from '../src/audits/result-persistence.ts';
import { AuditQueue, type AuditTask } from '../src/queue/audit-queue.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db),
  runtime = auditRuntime({});
const taskIds: string[] = [],
  workspaces: string[] = [];
it('continues recovery for other audits when one persisted parent cannot finalize', async () => {
  const first = await seed(),
    second = await seed();
  for (const t of [first, second])
    await db
      .updateTable('audit_tasks')
      .set({ status: 'failed', completed_at: new Date() })
      .where('audit_id', '=', t.auditId)
      .where('workspace_id', '=', t.workspaceId)
      .execute();
  const visited: string[] = [];
  await new AuditMaintenance(db, async (_workspace, id) => {
    visited.push(id);
    if (id === first.auditId) throw new Error('Broken projection fixture');
  }).runOnce();
  expect(visited).toContain(first.auditId);
  expect(visited).toContain(second.auditId);
});
afterEach(async () => {
  if (taskIds.length) {
    await db.deleteFrom('execution_cost_projections').where('task_id', 'in', taskIds).execute();
    await asOwner((owner) =>
      owner.deleteFrom('provider_attempts').where('task_id', 'in', taskIds).execute(),
    );
  }
  if (workspaces.length)
    await asOwner((owner) =>
      owner.deleteFrom('consumable_ledger').where('workspace_id', 'in', workspaces).execute(),
    );
  await fixtures.cleanup();
  taskIds.length = 0;
  workspaces.length = 0;
});
afterAll(async () => {
  await db.destroy();
});
async function seed() {
  const t = await auditTenant(db, fixtures);
  workspaces.push(t.workspaceId);
  const [auditId] = await createAudits(
    db,
    t.workspaceId,
    auditInput.parse({ project_id: t.projectId, prompt_set_id: t.setId, engines: ['chatgpt'] }),
    {},
    runtime,
  );
  const tasks = await db
    .selectFrom('audit_tasks')
    .selectAll()
    .where('workspace_id', '=', t.workspaceId)
    .where('audit_id', '=', auditId)
    .orderBy('randomized_position')
    .execute();
  taskIds.push(...tasks.map((task) => task.id));
  return { ...t, auditId, tasks };
}
async function runs(taskId: string) {
  const rows = await db
    .selectFrom('consumable_ledger')
    .select(['entry_kind', 'units'])
    .where('subject_id', '=', taskId)
    .where('capability_key', '=', 'prompt_runs_per_period')
    .execute();
  const total = (kind: string) =>
    rows.filter((row) => row.entry_kind === kind).reduce((sum, row) => sum + row.units, 0);
  return { reserved: total('reservation') - total('release'), consumed: total('debit') };
}
function answer(task: AuditTask): ExecutionResult {
  return {
    logical_engine: 'chatgpt',
    transport_provider: 'openai',
    transport_model: task.transport_model,
    answer_text: 'Acme Running is recommended.',
    search_used: false,
    search_events: [],
    citations: [],
    retrieved_sources: [],
    finish_reason: 'stop',
    raw_finish_reason: 'stop',
    latency_ms: 1,
    provider_metadata: {},
    normalized_usage: {
      uncached_input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      reasoning_tokens: null,
      total_tokens: null,
      web_search_requests: null,
      provider_cost_microusd: null,
    },
  };
}
describe('audit recovery against PostgreSQL', () => {
  it('uses database time to recover leases despite application clock skew', async () => {
    const t = await seed(),
      task = t.tasks[0]!;
    await db
      .updateTable('audit_tasks')
      .set({
        status: 'running',
        lease_owner: 'worker',
        lease_expires_at: sql<Date>`clock_timestamp() + interval '120 seconds'`,
      })
      .where('id', '=', task.id)
      .execute();
    const maintenance = new AuditMaintenance(db, async () => {});
    expect(await maintenance.runOnce(new Date(Date.now() + 86_400_000))).toBe(0);
    await db
      .updateTable('audit_tasks')
      .set({
        lease_expires_at: sql<Date>`clock_timestamp() - interval '1 second'`,
      })
      .where('id', '=', task.id)
      .execute();
    expect(await maintenance.runOnce(new Date(Date.now() - 86_400_000))).toBe(1);
    expect(
      await db
        .selectFrom('audit_tasks')
        .select(['status', 'attempt_count'])
        .where('id', '=', task.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      status: 'retry_wait',
      attempt_count: 1,
    });
  });
  it('fences the stale claim out once the same worker re-claims a reclaimed task, so only the live claim records its answer', async () => {
    const t = await seed(),
      task = t.tasks[0]!,
      scope = { workspaceId: t.workspaceId, auditId: t.auditId },
      queue = new AuditQueue(db, 120);
    await db
      .updateTable('audit_tasks')
      .set({ available_at: new Date(Date.now() + 3_600_000) })
      .where('audit_id', '=', t.auditId)
      .where('id', '!=', task.id)
      .execute();
    const [stale] = await queue.claim('worker', 1, scope);
    await db
      .updateTable('audit_tasks')
      .set({ lease_expires_at: sql<Date>`clock_timestamp() - interval '1 second'` })
      .where('id', '=', task.id)
      .execute();
    await new AuditMaintenance(db, async () => {}).runOnce();
    const [live] = await queue.claim('worker', 1, scope);
    expect([stale!.id, live!.id]).toEqual([task.id, task.id]);
    expect(await queue.heartbeat(stale!, stale!.lease_owner)).toBe(false);
    expect(await queue.markRunning(stale!, stale!.lease_owner)).toBeNull();
    const running = (await queue.markRunning(live!, live!.lease_owner))!.task;
    expect(
      await persistExecutionSuccess(
        db,
        running,
        stale!.lease_owner,
        answer(running),
        deriveExecution,
      ),
    ).toBeNull();
    const artifactId = await persistExecutionSuccess(
      db,
      running,
      live!.lease_owner,
      answer(running),
      deriveExecution,
    );
    expect(
      await db
        .selectFrom('raw_response_artifacts')
        .select('id')
        .where('task_id', '=', task.id)
        .execute(),
    ).toEqual([{ id: artifactId }]);
    expect(await runs(task.id)).toEqual({ reserved: 0, consumed: 1 });
  });
  it('returns a paid task whose poll lost its lease to polling without spending an attempt', async () => {
    const t = await seed(),
      task = t.tasks[0]!,
      maintenance = new AuditMaintenance(db, async () => {});
    await db
      .updateTable('audit_tasks')
      .set({
        provider_submission_ref: 'intent-tag',
        provider_task_id: 'paid-task',
        provider_task_submitted_at: new Date(),
        attempt_count: 1,
      })
      .where('id', '=', task.id)
      .execute();
    for (let reclaim = 0; reclaim < 3; reclaim++) {
      await db
        .updateTable('audit_tasks')
        .set({
          status: 'running',
          lease_owner: 'dead-poller',
          lease_expires_at: sql<Date>`clock_timestamp() - interval '1 second'`,
        })
        .where('id', '=', task.id)
        .execute();
      await maintenance.runOnce();
    }
    expect(
      await db
        .selectFrom('audit_tasks')
        .select(['status', 'attempt_count', 'lease_owner', 'provider_task_id'])
        .where('id', '=', task.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      status: 'awaiting_provider_result',
      attempt_count: 1,
      lease_owner: null,
      provider_task_id: 'paid-task',
    });
    expect(await runs(task.id)).toEqual({ reserved: 1, consumed: 0 });
  });
  it('reclaims each expired lease once, diverts paid uncertainty without spending budget and settles scoped terminal holds', async () => {
    const t = await seed(),
      foreign = await seed();
    const held = t.tasks[2]!.id,
      otherHeld = foreign.tasks[0]!.id;
    const at = new Date();
    await db
      .updateTable('audit_tasks')
      .set({
        status: 'running',
        lease_owner: 'dead-worker',
        lease_expires_at: new Date(at.getTime() - 1000),
      })
      .where('audit_id', '=', t.auditId)
      .execute();
    await db
      .updateTable('audit_tasks')
      .set({ provider_submission_ref: 'committed-intent', attempt_count: 3 })
      .where('id', '=', t.tasks[1]!.id)
      .execute();
    await db
      .updateTable('audit_tasks')
      .set({ attempt_count: t.tasks[2]!.max_attempts - 1, provider_route_snapshot: '{}' })
      .where('id', '=', t.tasks[2]!.id)
      .execute();
    const parents: string[] = [],
      maintenance = new AuditMaintenance(db, async (_workspace, auditId) => {
        parents.push(auditId);
      });
    const reclaimed = await Promise.all([maintenance.runOnce(at), maintenance.runOnce(at)]);
    reclaimed.push(await maintenance.runOnce(at));
    expect(reclaimed.reduce((a, b) => a + b, 0)).toBe(3);
    const tasks = await db
      .selectFrom('audit_tasks')
      .selectAll()
      .where('audit_id', '=', t.auditId)
      .execute();
    expect(tasks.find((row) => row.id === t.tasks[0]!.id)).toMatchObject({
      status: 'retry_wait',
      attempt_count: 1,
      provider_poll_count: 0,
      lease_owner: null,
    });
    expect(tasks.find((row) => row.id === t.tasks[1]!.id)).toMatchObject({
      status: 'submission_uncertain',
      attempt_count: 3,
      provider_poll_count: 1,
    });
    expect(tasks.find((row) => row.id === t.tasks[2]!.id)).toMatchObject({ status: 'failed' });
    expect(await runs(held)).toEqual({
      reserved: 0,
      consumed: 0,
    });
    expect(await runs(otherHeld)).toEqual({
      reserved: 1,
      consumed: 0,
    });
    expect(parents).toContain(t.auditId);
    expect(await maintenance.runOnce(at)).toBe(0);
  });
  it('cancels all open tasks atomically and rejects stale evidence while releasing only that workspace funding', async () => {
    const t = await seed(),
      foreign = await seed(),
      task = t.tasks[0]!;
    const held = task.id,
      otherHeld = foreign.tasks[0]!.id;
    await expect(
      cancelAudit(db, { workspaceId: foreign.workspaceId, projectId: null }, t.auditId),
    ).rejects.toMatchObject({
      status: 404,
    });
    await db
      .updateTable('audit_tasks')
      .set({
        status: 'running',
        lease_owner: 'worker',
        lease_expires_at: new Date(Date.now() + 120000),
      })
      .where('id', '=', task.id)
      .execute();
    await cancelAudit(db, { workspaceId: t.workspaceId, projectId: null }, t.auditId);
    expect(
      await persistExecutionSuccess(db, task, 'worker', answer(task), deriveExecution),
    ).toBeNull();
    expect(
      (
        await db
          .selectFrom('audit_tasks')
          .select('status')
          .where('audit_id', '=', t.auditId)
          .execute()
      ).every((row) => row.status === 'cancelled'),
    ).toBe(true);
    expect(await runs(held)).toEqual({
      reserved: 0,
      consumed: 0,
    });
    expect(await runs(otherHeld)).toEqual({
      reserved: 1,
      consumed: 0,
    });
  });
  it('repairs an artifact committed ahead of its queue transition without repeating evidence, then queues source inspection once after terminal commit', async () => {
    const t = await seed(),
      task = t.tasks[0]!;
    const at = new Date();
    await db
      .updateTable('audits')
      .set({ status: 'running', started_at: at })
      .where('id', '=', t.auditId)
      .execute();
    await db
      .updateTable('audit_tasks')
      .set({
        status: 'running',
        lease_owner: 'worker',
        lease_expires_at: new Date(at.getTime() + 120000),
      })
      .where('id', '=', task.id)
      .execute();
    const artifactId = await persistExecutionSuccess(
      db,
      task,
      'worker',
      answer(task),
      deriveExecution,
      { at },
    );
    await db
      .updateTable('audit_tasks')
      .set({
        status: 'running',
        lease_owner: 'repair',
        lease_expires_at: new Date(at.getTime() + 120000),
      })
      .where('id', '=', task.id)
      .execute();
    expect(await repairOwnedCompletion(db, task, 'repair', at)).toBe(true);
    expect(await repairOwnedCompletion(db, task, 'repair', at)).toBe(false);
    expect(
      await db
        .selectFrom('raw_response_artifacts')
        .select('id')
        .where('task_id', '=', task.id)
        .execute(),
    ).toEqual([{ id: artifactId }]);
    expect(
      await db
        .selectFrom('provider_attempts')
        .select('id')
        .where('task_id', '=', task.id)
        .execute(),
    ).toHaveLength(1);
    await db
      .updateTable('audit_tasks')
      .set({ status: 'failed', completed_at: at })
      .where('audit_id', '=', t.auditId)
      .where('id', '!=', task.id)
      .execute();
    const projections = auditProjections(db, null, {});
    await projections.finalize(t.workspaceId, t.auditId);
    await projections.finalize(t.workspaceId, t.auditId);
    const inspection = await db
      .selectFrom('analytics_tasks')
      .select(['task_kind', 'payload'])
      .where('workspace_id', '=', t.workspaceId)
      .where('task_kind', '=', 'source_page_inspection')
      .execute();
    expect(inspection).toEqual([
      { task_kind: 'source_page_inspection', payload: { audit_id: t.auditId } },
    ]);
  });
});
