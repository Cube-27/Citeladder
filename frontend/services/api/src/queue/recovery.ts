/** Expired discovery/integration leases are reclaimed without running provider work. */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import { queueRecovery } from '../config/queue-recovery.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';

const { statuses } = policy.task_queue;
type Queue = 'brand_discovery_tasks' | 'integration_sync_runs';

async function reclaim(db: Database, table: Queue, increment: number, batchSize: number) {
  const expired = await db
    .selectFrom(table)
    .select(['id', 'workspace_id'])
    .where('status', 'in', [statuses.leased, statuses.running])
    .where('lease_expires_at', '<=', sql<Date>`clock_timestamp()`)
    .orderBy('lease_expires_at')
    .orderBy('id')
    .limit(batchSize)
    .forUpdate()
    .skipLocked()
    .execute();
  if (!expired.length) return [];
  const exhausted = sql<boolean>`attempt_count + ${increment} >= max_attempts`;
  return db
    .updateTable(table)
    .set({
      status: sql<string>`case when ${exhausted} then ${statuses.failed} else ${statuses.retry_wait} end`,
      attempt_count: sql<number>`attempt_count + ${increment}`,
      lease_owner: null,
      lease_expires_at: null,
      heartbeat_at: null,
      updated_at: sql<Date>`clock_timestamp()`,
      available_at: sql<Date>`case when ${exhausted} then available_at else clock_timestamp() end`,
      completed_at: sql<Date | null>`case when ${exhausted} then clock_timestamp() else null end`,
      error_code: sql<string>`case when ${exhausted} and error_code = '' then ${policy.task_queue.max_attempts_error} else error_code end`,
      error_detail: sql<string>`case when ${exhausted} and error_code = '' then 'lease expired after max attempts exhausted' else error_detail end`,
    })
    .where(
      'id',
      'in',
      expired.map((row) => row.id),
    )
    .where(
      'workspace_id',
      'in',
      expired.map((row) => row.workspace_id),
    )
    .returning(['id', 'workspace_id', 'status', 'attempt_count'])
    .execute();
}

function logExhausted(
  queue: Queue,
  tasks: { id: string; workspace_id: string; status: string; attempt_count: number }[],
) {
  const logger = getLogger('workers.queue-recovery');
  for (const task of tasks) {
    if (task.status === statuses.failed)
      logger.warning('queue_task_attempts_exhausted', {
        queue,
        task_id: task.id,
        workspace_id: task.workspace_id,
        attempt_count: task.attempt_count,
      });
  }
}

export async function recoverDiscoveryLeases(db: Database, batchSize = queueRecovery.batchSize) {
  const tasks = await db.transaction().execute(async (trx) => {
    // Discovery counts the attempt on completion or recovery, never on claim.
    const tasks = await reclaim(trx, 'brand_discovery_tasks', 1, batchSize);
    const cfg = policy.discovery.constants;
    for (const task of tasks.filter((row) => row.status === statuses.failed)) {
      const parent = await trx
        .selectFrom('brand_discoveries as discovery')
        .innerJoin('brand_discovery_tasks as task', (join) =>
          join
            .onRef('task.discovery_id', '=', 'discovery.id')
            .onRef('task.workspace_id', '=', 'discovery.workspace_id'),
        )
        .selectAll('discovery')
        .where('task.id', '=', task.id)
        .where('discovery.workspace_id', '=', task.workspace_id)
        .forUpdate('discovery')
        .executeTakeFirst();
      if (
        !parent ||
        [
          cfg.discovery_status_ready,
          cfg.legacy_discovery_status_completing,
          cfg.discovery_status_project_created,
        ].includes(parent.status)
      )
        continue;
      const warnings = Array.isArray(parent.warnings) ? parent.warnings : [];
      await trx
        .updateTable('brand_discoveries')
        .set({
          status: cfg.discovery_status_failed,
          stage: 'failed',
          error_code: cfg.error_brand_discovery,
          error_detail: policy.task_queue.max_attempts_error,
          warnings: JSON.stringify([...new Set([...warnings, 'research_degraded'])]),
          updated_at: sql<Date>`clock_timestamp()`,
        })
        .where('id', '=', parent.id)
        .where('workspace_id', '=', task.workspace_id)
        .execute();
    }
    return tasks;
  });
  logExhausted('brand_discovery_tasks', tasks);
  return tasks.length;
}

export async function recoverIntegrationLeases(db: Database, batchSize = queueRecovery.batchSize) {
  // Integration claims already charge the attempt. Reclaiming must not charge it twice.
  const tasks = await db
    .transaction()
    .execute((trx) => reclaim(trx, 'integration_sync_runs', 0, batchSize));
  logExhausted('integration_sync_runs', tasks);
  return tasks.length;
}

export async function recoverQueues(db: Database, canAdmit = () => true) {
  const logger = getLogger('workers.queue-recovery');
  let reclaimed = 0;
  const failures: unknown[] = [];
  for (const [queue, recover] of [
    ['brand_discovery_tasks', recoverDiscoveryLeases],
    ['integration_sync_runs', recoverIntegrationLeases],
  ] as const) {
    if (!canAdmit()) break;
    try {
      reclaimed += await recover(db);
    } catch (error) {
      // One broken queue must not stop the independent recovery of the other.
      logger.exception('queue_recovery_failed', error, { queue });
      failures.push(error);
    }
  }
  if (reclaimed) logger.info('expired_queue_leases_recovered', { reclaimed });
  if (failures.length) throw new AggregateError(failures, 'Queue recovery failed');
  return reclaimed;
}
