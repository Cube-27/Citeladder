import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';
import { enqueueTask } from '../referrals/enqueue.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { policy } from '../config.ts';

export type CrawlScope = { workspaceId: string; projectId: string };
/** All ingestion, source mutations and rollup publication serialize here. */
export async function lockCrawlState(db: Database, scope: CrawlScope) {
  await db
    .insertInto('crawl_log_states')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      reporting_timezone: 'UTC',
      updated_at: new Date(),
    })
    .onConflict((c) => c.constraint('uq_crawl_log_state_project').doNothing())
    .execute();
  return db
    .selectFrom('crawl_log_states')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}
/** A queued successor is reusable; leased/running work always gets a new successor. */
export async function enqueueRollup(db: Database, scope: CrawlScope, now: Date) {
  const pending = await db
    .selectFrom('analytics_tasks')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('task_kind', '=', 'crawl_log_rollup_refresh')
    .where('status', '=', policy.task_queue.statuses.queued)
    .executeTakeFirst();
  if (pending) return;
  const id = await enqueueTask(db, {
    ...scope,
    kind: 'crawl_log_rollup_refresh',
    payload: {},
    keyParts: [scope.projectId, randomUUID()],
    maxAttempts: crawlLogs.task_max_attempts,
  });
  if (id)
    await db
      .updateTable('analytics_tasks')
      .set({
        available_at: new Date(now.getTime() + crawlLogs.refresh_delay_seconds * 1000),
      })
      .where('id', '=', id)
      .where('workspace_id', '=', scope.workspaceId)
      .execute();
}
