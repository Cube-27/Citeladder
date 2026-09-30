/** Durable recovery of failed TS work, including tasks terminalized by the Python sweeper. */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { getLogger } from '../logging.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { compensateInternalLinks } from '../site-health/internal-link-judgments.ts';
import { compensateInspection } from '../source-pages/inspector.ts';

const compensators: Record<string, (db: Database, task: QueueTask) => Promise<void>> = {
  source_page_inspection: compensateInspection,
  internal_link_judgment: compensateInternalLinks,
};

export async function compensateTerminalTasks(db: Database) {
  const tasks = await db
    .selectFrom('analytics_tasks')
    .selectAll()
    .where('task_kind', 'in', Object.keys(compensators))
    .where('status', '=', 'failed')
    .where(sql<boolean>`payload->>'terminal_compensated_at' is null`)
    .orderBy('completed_at')
    .limit(policy.analytics.terminal_compensation_batch)
    .execute();
  for (const task of tasks) {
    try {
      await compensators[task.task_kind]!(db, task);
      await db
        .updateTable('analytics_tasks')
        .set({
          payload: JSON.stringify({
            ...record(task.payload),
            terminal_compensated_at: new Date().toISOString(),
          }),
        })
        .where('id', '=', task.id)
        .where('workspace_id', '=', task.workspace_id)
        .where('status', '=', 'failed')
        .execute();
    } catch (error) {
      getLogger('app.workers.terminal_compensation').exception(
        'terminal compensation failed',
        error,
        { task_id: task.id },
      );
    }
  }
}
