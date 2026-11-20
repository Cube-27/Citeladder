/**
 * The optional probe schedule (AV-33): one audit schedule in the probe scope,
 * kept by the audit schedule owner, so a due probe enters the same admission
 * path as Run probe. Off deletes it.
 */
import type { ProbeScheduleRequest } from '@citeladder/contracts/probes';

import { auditRuntime, type AuditRuntime } from '../audits/config.ts';
import { scheduleCreate } from '../audits/schedule-inputs.ts';
import { createSchedule, deleteSchedule, updateSchedule } from '../audits/schedules.ts';
import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import { probePlan, promptSetOf, runnable } from './plan.ts';

type Scope = { workspaceId: string; projectId: string };

export function setProbeSchedule(
  db: Database,
  scope: Scope,
  input: ProbeScheduleRequest,
  runtime: AuditRuntime = auditRuntime(),
) {
  return inTransaction(db, async (trx) => {
    // The project row serializes schedule writes, so concurrent requests keep one schedule.
    await trx
      .selectFrom('projects')
      .select('id')
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', '=', scope.projectId)
      .forUpdate()
      .executeTakeFirst();
    await applySchedule(trx, scope, input, runtime);
  });
}

async function applySchedule(
  db: Database,
  scope: Scope,
  { cadence }: ProbeScheduleRequest,
  runtime: AuditRuntime,
) {
  const existing = await db
    .selectFrom('audit_schedules')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('audit_scope', '=', policy.probes.audit_scope)
    .execute();
  if (cadence === null) {
    for (const schedule of existing) await deleteSchedule(db, scope, schedule.id); // NOSONAR -- A project holds at most a few, removed in order.
    return;
  }
  const plan = runnable(await probePlan(db, scope, { runtime, at: new Date() }));
  const markets = plan.runs.map((run) => run.market.id);
  const [current] = existing;
  if (current) {
    await updateSchedule(db, scope, current.id, {
      cadence,
      enabled: true,
      engines: plan.engines,
      market_ids: markets,
    });
    return;
  }
  await createSchedule(
    db,
    scope,
    scheduleCreate.parse({
      prompt_set_id: await promptSetOf(db, scope),
      audit_scope: policy.probes.audit_scope,
      cadence,
      engines: plan.engines,
      market_ids: markets,
    }),
  );
}
