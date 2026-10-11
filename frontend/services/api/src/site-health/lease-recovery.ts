/** Site Health's sole expired-lease writer; the worker reconciles crawls whose tasks it fails. */
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { reclaimExpiredLeases } from '../queue/recovery.ts';

const logger = getLogger('app.workers.site_health_worker');

export function recoverExpiredLeases(
  db: Database,
  batchSize: number,
  now = new Date(),
  scope?: { workspaceId: string; crawlId: string },
) {
  return db
    .transaction()
    .execute((trx) =>
      reclaimExpiredLeases(trx, {
        table: 'site_crawl_tasks',
        charge: 1,
        batchSize,
        at: now,
        parent: 'crawl_id',
        scope:
          scope &&
          sql<boolean>`workspace_id = ${scope.workspaceId} and crawl_id = ${scope.crawlId}`,
      }),
    )
    .then((rows) => {
      const failed = rows.filter((task) => task.status === 'failed');
      for (const task of failed)
        logger.warning('sweeper failed task at max attempts', {
          task_id: task.id,
          parent_id: task.parent_id,
          attempt_count: task.attempt_count,
          queue: 'site_crawl_tasks',
        });
      if (rows.length)
        logger.info('sweeper reclaimed expired leases', {
          reclaimed: rows.length,
          failed: failed.length,
        });
      const crawls = new Map(
        failed.map((task) => [
          task.parent_id,
          { crawlId: task.parent_id, workspaceId: task.workspace_id },
        ]),
      );
      return {
        reclaimed: rows.length,
        failedTaskIds: failed.map((task) => task.id),
        failedCrawls: [...crawls.values()],
      };
    });
}
