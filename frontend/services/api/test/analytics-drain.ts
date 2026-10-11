import { loadWorkerSettings } from '../src/config.ts';
import type { Database } from '../src/db/database.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';

type DrainOptions = Omit<
  NonNullable<ConstructorParameters<typeof AnalyticsWorker>[2]>,
  'taskScope'
>;

/**
 * Drains one workspace's analytics tasks, successors included, as
 * `runUntilIdle` drains the queue. The local database is shared with other
 * test runs, so each pass is scoped to the tasks this workspace holds then.
 * Returns how many tasks ran.
 */
export async function drainWorkspace(
  db: Database,
  workspaceId: string,
  options: DrainOptions = {},
  settings = loadWorkerSettings({}),
) {
  let total = 0;
  for (let batch = 0; batch < 1000; batch += 1) {
    const rows = await db
      .selectFrom('analytics_tasks')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .execute();
    if (rows.length === 0) break;
    const taskScope = { workspaceId, taskIds: rows.map((row) => row.id) };
    const ran = await new AnalyticsWorker(db, settings, { ...options, taskScope }).runOnce();
    if (ran === 0) break;
    total += ran;
  }
  return total;
}
