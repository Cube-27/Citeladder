/** Site Health's sole expired-lease writer; the worker reconciles crawls whose tasks it fails. */
import { policy } from '../config.ts';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';

const logger = getLogger('app.workers.site_health_worker');

export function recoverExpiredLeases(db: Database, batchSize: number, now = new Date()) {
  return db
    .transaction()
    .execute(async (trx) => {
      const expired = await trx
        .selectFrom('site_crawl_tasks')
        .select('id')
        .where('status', 'in', ['leased', 'running'])
        .where('lease_expires_at', '<=', sql<Date>`clock_timestamp()`)
        .orderBy('lease_expires_at')
        .orderBy('id')
        .limit(batchSize)
        .forUpdate()
        .skipLocked()
        .execute();
      if (!expired.length) return [];
      return trx
        .updateTable('site_crawl_tasks')
        .set({
          status: sql<string>`case when attempt_count + 1 >= max_attempts then 'failed' else 'retry_wait' end`,
          attempt_count: sql<number>`attempt_count + 1`,
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
          updated_at: now,
          available_at: sql<Date>`case when attempt_count + 1 >= max_attempts then available_at else ${now} end`,
          completed_at: sql<Date | null>`case when attempt_count + 1 >= max_attempts then ${now}::timestamptz else null end`,
          error_code: sql<string>`case when attempt_count + 1 >= max_attempts and error_code = '' then ${policy.task_queue.max_attempts_error} else error_code end`,
          error_detail: sql<string>`case when attempt_count + 1 >= max_attempts and error_code = '' then 'lease expired after max attempts exhausted' else error_detail end`,
        })
        .where(
          'id',
          'in',
          expired.map((task) => task.id),
        )
        .returning(['id', 'crawl_id', 'workspace_id', 'attempt_count', 'status'])
        .execute();
    })
    .then((rows) => {
      const failed = rows.filter((task) => task.status === 'failed');
      for (const task of failed)
        logger.warning('sweeper failed task at max attempts', {
          task_id: task.id,
          parent_id: task.crawl_id,
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
          task.crawl_id,
          { crawlId: task.crawl_id, workspaceId: task.workspace_id },
        ]),
      );
      return {
        reclaimed: rows.length,
        failedTaskIds: failed.map((task) => task.id),
        failedCrawls: [...crawls.values()],
      };
    });
}
