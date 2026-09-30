import type { Database } from '../db/database.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { TaskCancelledError } from '../workers/executor.ts';

/** Called inside the mutation transaction, before project/page locks. */
export async function fenceInspectionTask(db: Database, task?: QueueTask) {
  if (!task) return;
  const owned = await db
    .selectFrom('analytics_tasks')
    .select('id')
    .where('id', '=', task.id)
    .where('workspace_id', '=', task.workspace_id)
    .where('project_id', '=', task.project_id)
    .where('status', '=', 'running')
    .where('lease_owner', '=', task.lease_owner)
    .where('lease_expires_at', '>', new Date())
    .forUpdate()
    .executeTakeFirst();
  if (!owned) throw new TaskCancelledError('Source-page inspection no longer owns its lease');
}
