import { policy } from '../config.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import type { Database } from '../db/database.ts';
import { enqueueTask } from '../queue/enqueue.ts';

const probes = policy.probes;

export const ANSWERED_STATUSES = ['completed', 'partially_completed'];

export function enqueueProbeLabelling(
  db: Database,
  launch: { workspaceId: string; projectId: string; launchId: string },
) {
  return enqueueTask(db, {
    workspaceId: launch.workspaceId,
    projectId: launch.projectId,
    kind: probes.task_kind,
    payload: { launch_id: launch.launchId },
    keyParts: [launch.launchId, probes.labelling_version],
    maxAttempts: probes.task_max_attempts,
  });
}

export async function labelEndedLaunch(
  db: Database,
  audit: { workspaceId: string; projectId: string; scope: string; launchId: string | null },
) {
  if (audit.scope !== probes.audit_scope || audit.launchId === null) return;
  await subjectXactLock(db, `probe_launch:${audit.launchId}`);
  const runs = await db
    .selectFrom('audits')
    .select('status')
    .where('workspace_id', '=', audit.workspaceId)
    .where('project_id', '=', audit.projectId)
    .where('launch_id', '=', audit.launchId)
    .execute();
  const terminal = policy.audits.constants.audit_terminal_statuses;
  if (runs.some((run) => !terminal.includes(run.status))) return;
  if (!runs.some((run) => ANSWERED_STATUSES.includes(run.status))) return;
  await enqueueProbeLabelling(db, { ...audit, launchId: audit.launchId });
}
