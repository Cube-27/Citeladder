/**
 * The optional probe schedule (AV-33): one audit schedule in the probe scope,
 * kept by the audit schedule owner, so a due probe enters the same admission
 * path as Run probe. Turning it on confirms the quote's cost per run, as Run
 * probe does; Off deletes it.
 */
import type { ProbeScheduleRequest } from '@citeladder/contracts/probes';

import { auditRuntime, type AuditRuntime } from '../audits/config.ts';
import { probeScheduleCreate } from '../audits/schedule-inputs.ts';
import { createSchedule, deleteSchedule, updateSchedule } from '../audits/schedules.ts';
import { policy } from '../config.ts';
import { inTransaction, type Database } from '../db/database.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { changed, probePlan, promptSetOf, runnable } from './plan.ts';

/** The project's probe schedules; callers add their columns. */
export function probeSchedules(db: Database, scope: Scope) {
  return db
    .selectFrom('audit_schedules')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('audit_scope', '=', policy.probes.audit_scope);
}

export function setProbeSchedule(
  db: Database,
  scope: Scope,
  input: ProbeScheduleRequest,
  runtime: AuditRuntime = auditRuntime(),
) {
  return inTransaction(db, async (trx) => {
    // The project row serializes schedule writes, so concurrent requests keep
    // one schedule; NO KEY UPDATE leaves the scheduler's key-share lock free.
    await trx
      .selectFrom('projects')
      .select('id')
      .where('workspace_id', '=', scope.workspaceId)
      .where('id', '=', scope.projectId)
      .forNoKeyUpdate()
      .executeTakeFirst();
    await applySchedule(trx, scope, input, runtime);
  });
}

async function applySchedule(
  db: Database,
  scope: Scope,
  input: ProbeScheduleRequest,
  runtime: AuditRuntime,
) {
  const existing = await probeSchedules(db, scope).select('id').execute();
  if (input.cadence === null) {
    for (const schedule of existing) await deleteSchedule(db, scope, schedule.id); // NOSONAR -- A project holds at most a few, removed in order.
    return;
  }
  const plan = runnable(await probePlan(db, scope, { runtime, at: new Date() }));
  if (plan.fingerprint !== input.fingerprint) throw changed();
  const markets = plan.runs.map((run) => run.market.id);
  const [current] = existing;
  if (current) {
    await updateSchedule(db, scope, current.id, {
      cadence: input.cadence,
      enabled: true,
      engines: plan.engines,
      market_ids: markets,
    });
    return;
  }
  await createSchedule(
    db,
    scope,
    probeScheduleCreate.parse({
      prompt_set_id: await promptSetOf(db, scope),
      audit_scope: policy.probes.audit_scope,
      cadence: input.cadence,
      engines: plan.engines,
      market_ids: markets,
    }),
  );
}
