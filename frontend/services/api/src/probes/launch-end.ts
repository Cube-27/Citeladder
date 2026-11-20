/**
 * A probe launch is labelled once, when its last market run ends (AV-28): one
 * pass over every market's answers, so a first probe groups its objections
 * once, not once per market. Sibling runs ending together take the launch's
 * lock after their own audit row, so the last to end sees the others ended.
 */
import { policy } from '../config.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import type { Database } from '../db/database.ts';
import { enqueueTask } from '../queue/enqueue.ts';

const probes = policy.probes;

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

/** In the transaction that ends a run: queues its launch's labelling when no sibling is still open. */
export async function labelEndedLaunch(
  db: Database,
  audit: { workspaceId: string; projectId: string; scope: string; launchId: string | null },
) {
  if (audit.scope !== probes.audit_scope || audit.launchId === null) return;
  await subjectXactLock(db, `probe_launch:${audit.launchId}`);
  const open = await db
    .selectFrom('audits')
    .select('id')
    .where('workspace_id', '=', audit.workspaceId)
    .where('launch_id', '=', audit.launchId)
    .where('status', 'not in', policy.audits.constants.audit_terminal_statuses)
    .executeTakeFirst();
  if (open) return;
  await enqueueProbeLabelling(db, { ...audit, launchId: audit.launchId });
}
