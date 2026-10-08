import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { AgentError, type Lease, type Run } from './contracts.ts';
import { appendRecoveryReply } from './messages.ts';

const { statuses, claimable, active, terminal } = policy.task_queue;
export async function lockRun(db: Database, lease: Lease): Promise<Run> {
  const run = await db
    .selectFrom('agent_runs')
    .selectAll()
    .where('id', '=', lease.runId)
    .where('workspace_id', '=', lease.workspaceId)
    .where('lease_owner', '=', lease.owner)
    .where('attempt_count', '=', lease.attempt)
    .where('status', '=', statuses.running)
    .where('cancelled_at', 'is', null)
    .where('lease_expires_at', '>', sql<Date>`clock_timestamp()`)
    .forUpdate()
    .executeTakeFirst();
  if (!run) throw new AgentError('lease');
  return run;
}
export async function terminalize(
  db: Database,
  lease: Lease,
  status: 'succeeded' | 'failed',
  code = '',
) {
  await lockRun(db, lease);
  await db
    .updateTable('agent_runs')
    .set({
      status,
      error_code: code,
      error_detail: '',
      completed_at: sql<Date>`clock_timestamp()`,
      updated_at: sql<Date>`clock_timestamp()`,
      lease_owner: null,
      lease_expires_at: null,
    })
    .where('id', '=', lease.runId)
    .where('workspace_id', '=', lease.workspaceId)
    .execute();
}

/** Workspace sets come from the process owner, with bounded lease recovery. */
export class AgentQueue {
  readonly db: Database;
  readonly leaseSeconds: number;
  constructor(db: Database, leaseSeconds: number) {
    this.db = db;
    this.leaseSeconds = leaseSeconds;
    if (!Number.isFinite(leaseSeconds) || leaseSeconds <= 0)
      throw new TypeError('Invalid lease TTL');
  }
  claim(owner: string, workspaceIds: readonly string[], runId?: string): Promise<Run | null> {
    if (!workspaceIds.length) return Promise.resolve(null);
    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('agent_runs as run')
        .leftJoin('queue_workspace_turns as turns', (join) =>
          join
            .onRef('turns.workspace_id', '=', 'run.workspace_id')
            .on('turns.queue_name', '=', 'agent_runs'),
        )
        .selectAll('run')
        .where('run.workspace_id', 'in', workspaceIds)
        .$if(Boolean(runId), (query) => query.where('run.id', '=', runId!))
        .where('run.status', 'in', claimable)
        .where('run.available_at', '<=', sql<Date>`clock_timestamp()`)
        .whereRef('run.attempt_count', '<', 'run.max_attempts')
        .orderBy(sql`turns.last_claimed_at asc nulls first`)
        .orderBy('run.priority', 'desc')
        .orderBy('run.available_at')
        .orderBy('run.randomized_position')
        .orderBy('run.id')
        .limit(1)
        .forUpdate('run')
        .skipLocked()
        .executeTakeFirst();
      if (!row) return null;
      const claimed = await trx
        .updateTable('agent_runs')
        .set({
          status: statuses.leased,
          lease_owner: owner,
          lease_expires_at: sql<Date>`clock_timestamp() + ${this.leaseSeconds} * interval '1 second'`,
          heartbeat_at: sql<Date>`clock_timestamp()`,
          updated_at: sql<Date>`clock_timestamp()`,
        })
        .where('id', '=', row.id)
        .where('workspace_id', '=', row.workspace_id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('queue_workspace_turns')
        .values({
          id: randomUUID(),
          workspace_id: row.workspace_id,
          queue_name: 'agent_runs',
          last_claimed_at: sql<Date>`clock_timestamp()`,
          created_at: new Date(),
        })
        .onConflict((conflict) =>
          conflict
            .constraint('uq_queue_workspace_turn')
            .doUpdateSet({ last_claimed_at: sql<Date>`clock_timestamp()` }),
        )
        .execute();
      return claimed;
    });
  }
  async start(run: Run, owner: string): Promise<Lease> {
    const row = await this.db
      .updateTable('agent_runs')
      .set({
        status: statuses.running,
        attempt_count: sql`attempt_count + 1`,
        updated_at: sql<Date>`clock_timestamp()`,
      })
      .where('id', '=', run.id)
      .where('workspace_id', '=', run.workspace_id)
      .where('lease_owner', '=', owner)
      .where('status', '=', statuses.leased)
      .whereRef('attempt_count', '<', 'max_attempts')
      .where('lease_expires_at', '>', sql<Date>`clock_timestamp()`)
      .returning('attempt_count')
      .executeTakeFirst();
    if (!row) throw new AgentError('lease');
    return { runId: run.id, workspaceId: run.workspace_id, owner, attempt: row.attempt_count };
  }
  async heartbeat(lease: Lease) {
    const result = await this.db
      .updateTable('agent_runs')
      .set({
        heartbeat_at: sql<Date>`clock_timestamp()`,
        lease_expires_at: sql<Date>`clock_timestamp() + ${this.leaseSeconds} * interval '1 second'`,
        updated_at: sql<Date>`clock_timestamp()`,
      })
      .where('id', '=', lease.runId)
      .where('workspace_id', '=', lease.workspaceId)
      .where('lease_owner', '=', lease.owner)
      .where('attempt_count', '=', lease.attempt)
      .where('status', '=', statuses.running)
      .where('lease_expires_at', '>', sql<Date>`clock_timestamp()`)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
  retry(lease: Lease, delaySeconds: number, reconcile: (db: Database, run: Run) => Promise<void>) {
    return this.db.transaction().execute(async (trx) => {
      const run = await lockRun(trx, lease);
      await reconcile(trx, run);
      const exhausted = run.attempt_count >= run.max_attempts;
      await trx
        .updateTable('agent_runs')
        .set({
          status: exhausted ? statuses.failed : statuses.retry_wait,
          error_code: 'provider_error',
          updated_at: sql<Date>`clock_timestamp()`,
          lease_owner: null,
          lease_expires_at: null,
          available_at: sql<Date>`clock_timestamp() + ${delaySeconds} * interval '1 second'`,
          completed_at: exhausted ? sql<Date>`clock_timestamp()` : null,
        })
        .where('id', '=', run.id)
        .where('workspace_id', '=', run.workspace_id)
        .execute();
      if (exhausted) await appendRecoveryReply(trx, run, 'provider_error');
    });
  }
  /** Caller supplies accounting; recovery cannot abandon an open credit hold. */
  recover(
    workspaceIds: readonly string[],
    limit: number,
    reconcile: (db: Database, run: Run) => Promise<void>,
  ) {
    if (!workspaceIds.length) return Promise.resolve(0);
    return this.db.transaction().execute(async (trx) => {
      const rows = await trx
        .selectFrom('agent_runs')
        .selectAll()
        .where('workspace_id', 'in', workspaceIds)
        .where('status', 'in', [statuses.leased, statuses.running])
        .where('lease_expires_at', '<=', sql<Date>`clock_timestamp()`)
        .orderBy('lease_expires_at')
        .orderBy('id')
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      for (const run of rows) {
        // Ledger settlement and terminal writes share one ordered transaction.
        await reconcile(trx, run); // NOSONAR
        const attempts = run.attempt_count + (run.status === statuses.leased ? 1 : 0);
        const exhausted = attempts >= run.max_attempts;
        await trx // NOSONAR
          .updateTable('agent_runs')
          .set({
            attempt_count: attempts,
            status: exhausted ? statuses.failed : statuses.retry_wait,
            error_code: exhausted ? 'max_attempts_exceeded' : run.error_code,
            updated_at: sql<Date>`clock_timestamp()`,
            lease_owner: null,
            lease_expires_at: null,
            available_at: sql<Date>`clock_timestamp()`,
            completed_at: exhausted ? sql<Date>`clock_timestamp()` : null,
          })
          .where('id', '=', run.id)
          .where('workspace_id', '=', run.workspace_id)
          .execute();
        if (exhausted) await appendRecoveryReply(trx, run, 'max_attempts_exceeded'); // NOSONAR
      }
      return rows.length;
    });
  }
}
export { active, terminal };
