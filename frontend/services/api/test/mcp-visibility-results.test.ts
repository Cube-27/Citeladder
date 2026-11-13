import { afterAll, expect, it } from 'vitest';
import { dispatchTool } from '../src/mcp/tools.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

it('reads answers from the latest completed run of this project when no audit_id is named', async () => {
  const tenant = await fixtures.tenant();
  const read = (args: Record<string, unknown> = {}) =>
    dispatchTool(
      db,
      { kind: 'member', ...tenant },
      'read_visibility_results',
      { project_id: tenant.projectId, ...args },
      '',
    );
  expect(await read()).toMatchObject({ state: 'unavailable', reason: 'no_completed_run' });
  const older = await fixtures.audit(tenant, { completedAt: new Date('2026-10-01T00:00:00Z') });
  await fixtures.execution(tenant, { auditId: older });
  const latest = await fixtures.audit(tenant, { completedAt: new Date('2026-10-02T00:00:00Z') });
  const { taskId } = await fixtures.execution(tenant, { auditId: latest });
  await fixtures.audit(tenant, { completedAt: null, status: 'running' });
  // Another workspace's newer run is never the default.
  const foreign = await fixtures.tenant();
  await fixtures.execution(foreign, {
    auditId: await fixtures.audit(foreign, { completedAt: new Date('2026-10-03T00:00:00Z') }),
  });
  const page = await read();
  expect(page).toMatchObject({ state: 'available', audit_id: latest });
  expect((page.items as { task_id: string }[]).map((item) => item.task_id)).toEqual([taskId]);
  expect(await read({ audit_id: older })).toMatchObject({ audit_id: older });
});
