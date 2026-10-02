/** Analytics recovery is bounded and serializes against heartbeats and publication. */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
const { statuses } = policy.task_queue;

export async function recoverAnalyticsLeases(db: Database, batchSize: number) {
  const rows = await db.transaction().execute(async (trx) => {
    const expired = await trx
      .selectFrom('analytics_tasks')
      .select('id')
      .where('task_kind', 'in', policy.analytics.ts_owned_task_kinds)
      .where('status', 'in', [statuses.leased, statuses.running])
      .where('lease_expires_at', '<=', sql<Date>`clock_timestamp()`)
      .orderBy('lease_expires_at')
      .orderBy('id')
      .limit(batchSize)
      .forUpdate()
      .skipLocked()
      .execute();
    if (!expired.length) return [];
    return trx
      .updateTable('analytics_tasks')
      .set({
        status: sql<string>`case when attempt_count + 1 >= max_attempts then ${statuses.failed} else ${statuses.retry_wait} end`,
        attempt_count: sql<number>`attempt_count + 1`,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        updated_at: sql<Date>`clock_timestamp()`,
        available_at: sql<Date>`case when attempt_count + 1 >= max_attempts then available_at else clock_timestamp() end`,
        completed_at: sql<Date | null>`case when attempt_count + 1 >= max_attempts then clock_timestamp() else null end`,
        error_code: sql<string>`case when attempt_count + 1 >= max_attempts and error_code = '' then ${policy.task_queue.max_attempts_error} else error_code end`,
        error_detail: sql<string>`case when attempt_count + 1 >= max_attempts and error_code = '' then 'lease expired after max attempts exhausted' else error_detail end`,
      })
      .where(
        'id',
        'in',
        expired.map((row) => row.id),
      )
      .returning(['id', 'status', 'attempt_count'])
      .execute();
  });
  const logger = getLogger('workers.analytics-recovery');
  for (const task of rows.filter((row) => row.status === statuses.failed))
    logger.warning('analytics lease recovery exhausted attempts', {
      task_id: task.id,
      attempt_count: task.attempt_count,
      queue: 'analytics_tasks',
    });
  if (rows.length)
    logger.info('analytics recovered expired leases', {
      reclaimed: rows.length,
      failed: rows.filter((row) => row.status === statuses.failed).length,
    });
  return rows.length;
}
