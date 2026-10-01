import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { AuditQueue, ownedAuditTask, parkAuditTask } from '../src/queue/audit-queue.ts';
import { createAudit } from '../src/audits/creation.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { auditTenant } from './audit-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const runtime = auditRuntime({});
let at = new Date();
const queue = new AuditQueue(db, 120, () => at);
afterEach(async () => {
  await fixtures.cleanup();
});
afterAll(async () => {
  await db.destroy();
});
async function seed() {
  const t = await auditTenant(db, fixtures);
  at = new Date();
  const auditId = await createAudit(
    db,
    t.workspaceId,
    auditInput.parse({ project_id: t.projectId, prompt_set_id: t.setId, engines: ['chatgpt'] }),
    {},
    runtime,
    at,
  );
  return { ...t, auditId };
}
describe('audit queue leases against PostgreSQL', () => {
  it('gives each workspace a turn and concurrent claims never share a task', async () => {
    const one = await seed(),
      two = await seed();
    const fair = await queue.claim('fair', 2);
    expect(new Set(fair.map((task) => task.workspace_id))).toEqual(
      new Set([one.workspaceId, two.workspaceId]),
    );
    const claimed = (
      await Promise.all(['worker-a', 'worker-b'].map((owner) => queue.claim(owner, 3)))
    ).flat();
    expect(claimed).toHaveLength(4);
    expect(new Set([...fair, ...claimed].map((task) => task.id)).size).toBe(6);
  });
  it('rejects another owner, an expired lease and a cancelled parent before execution', async () => {
    const t = await seed();
    const [task] = await queue.claim('worker');
    expect(await queue.markRunning(task!, 'other')).toBeNull();
    expect(await queue.heartbeat(task!, 'other')).toBe(false);
    const running = await queue.markRunning(task!, 'worker');
    expect(running?.audit.status).toBe('running');
    at = new Date(at.getTime() + 121000);
    expect(await queue.heartbeat(task!, 'worker')).toBe(false);
    expect(await queue.markRunning(task!, 'worker')).toBeNull();
    const [another] = await queue.claim('worker');
    await db
      .updateTable('audits')
      .set({ status: 'cancelled' })
      .where('id', '=', t.auditId)
      .execute();
    expect(await queue.markRunning(another!, 'worker')).toBeNull();
  });
  it('parks a committed external submission and reclaims its due poll without spending an attempt', async () => {
    await seed();
    const [task] = await queue.claim('worker');
    const ready = new Date(at.getTime() + 30000);
    await db.transaction().execute(async (trx) => {
      const locked = await ownedAuditTask(trx, task!, 'worker', at);
      expect(locked).not.toBeNull();
      await trx
        .updateTable('audit_tasks')
        .set({
          provider_submission_ref: 'intent-tag',
          provider_task_id: 'paid-task',
          provider_task_submitted_at: at,
        })
        .where('id', '=', task!.id)
        .execute();
      await parkAuditTask(trx, locked!.task, 'awaiting_provider_result', ready, at);
    });
    await queue.claim('drain', 3); // Other ready slots may progress while this task waits.
    expect(await queue.claim('poller')).toEqual([]);
    at = ready;
    const [poll] = await queue.claim('poller');
    expect(poll).toMatchObject({
      id: task!.id,
      provider_task_id: 'paid-task',
      provider_submission_ref: 'intent-tag',
      attempt_count: 0,
    });
  });
});
