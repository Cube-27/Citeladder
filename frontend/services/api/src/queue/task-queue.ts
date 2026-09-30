/**
 * The PostgreSQL task queue for `analytics_tasks` (invariant 8).
 *
 * Ports the claim, lease and heartbeat of
 * `backend/app/orchestration/postgres_task_queue.py`, which keeps serving
 * every other queue. Both stacks claim from the same table with disjoint kind
 * sets (`ANALYTICS_TS_OWNED_TASK_KINDS`), so this module must make exactly the
 * same promises: a claim locks eligible rows `FOR UPDATE SKIP LOCKED`, commits
 * before the caller does any work, and gives each workspace one task before
 * any workspace gets a second. Lease expiry stays with the Python sweeper.
 */
import { randomUUID } from 'node:crypto';

import { sql, type Selectable } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { AnalyticsTasks } from '../generated/db-schema.ts';
import { compareText } from '../text-order.ts';

export type QueueTask = Selectable<AnalyticsTasks>;

const QUEUE_TABLE = 'analytics_tasks';
const { statuses, claimable } = policy.task_queue;

export type TaskQueueOptions = {
  leaseTtlSeconds: number;
  /** The clock; tests pin it. */
  now?: () => Date;
};

function addSeconds(instant: Date, seconds: number): Date {
  return new Date(instant.getTime() + seconds * 1000);
}

/**
 * The locking SELECT one claim runs.
 *
 * Eligibility (`status`/`available_at`) is applied twice on purpose: inside
 * the ranked subquery, to number each workspace's backlog, and on the
 * locked relation itself. Under READ COMMITTED a statement that meets a row
 * another transaction updated and committed re-evaluates only the quals on
 * the locked relation; with the predicate only in the subquery, two claims
 * whose statements overlap return the same row once the first commits.
 * `task_kind` is immutable after insert, so it needs no outer copy.
 */
export function claimStatement(
  db: Database,
  options: { now: Date; limit: number; kinds: readonly string[] },
) {
  const { now, limit, kinds } = options;
  const ranked = db
    .selectFrom(QUEUE_TABLE)
    .select([
      'id as task_id',
      sql<number>`row_number() over (partition by workspace_id order by priority desc, available_at asc, randomized_position asc)`.as(
        'workspace_position',
      ),
    ])
    .where('status', 'in', claimable)
    .where('available_at', '<=', now)
    .where('task_kind', 'in', kinds)
    .as('fair_queue_candidates');
  return (
    db
      .selectFrom(QUEUE_TABLE)
      .innerJoin(ranked, 'fair_queue_candidates.task_id', 'analytics_tasks.id')
      .leftJoin('queue_workspace_turns', (join) =>
        join
          .on('queue_workspace_turns.queue_name', '=', QUEUE_TABLE)
          .onRef('queue_workspace_turns.workspace_id', '=', 'analytics_tasks.workspace_id'),
      )
      .selectAll('analytics_tasks')
      .where('analytics_tasks.status', 'in', claimable)
      .where('analytics_tasks.available_at', '<=', now)
      // One task per workspace before any workspace receives its second.
      .orderBy('fair_queue_candidates.workspace_position', 'asc')
      .orderBy(sql`queue_workspace_turns.last_claimed_at asc nulls first`)
      .orderBy('analytics_tasks.priority', 'desc')
      .orderBy('analytics_tasks.available_at', 'asc')
      .orderBy('analytics_tasks.randomized_position', 'asc')
      .limit(limit)
      .forUpdate(QUEUE_TABLE)
      .skipLocked()
  );
}

export class TaskQueue {
  readonly #db: Database;
  readonly #leaseTtlSeconds: number;
  readonly #now: () => Date;

  constructor(db: Database, options: TaskQueueOptions) {
    this.#db = db;
    this.#leaseTtlSeconds = options.leaseTtlSeconds;
    this.#now = options.now ?? (() => new Date());
  }

  /** Claim up to `limit` eligible rows of `kinds` for `owner`, committed. */
  claim(options: {
    owner: string;
    kinds: readonly string[];
    limit?: number;
  }): Promise<QueueTask[]> {
    const { owner, kinds, limit = 1 } = options;
    if (kinds.length === 0) return Promise.resolve([]);
    const now = this.#now();
    const leaseExpires = addSeconds(now, this.#leaseTtlSeconds);
    return this.#db.transaction().execute(async (trx) => {
      const locked = await claimStatement(trx, { now, limit, kinds }).execute();
      if (locked.length === 0) return [];
      const claimed = await trx
        .updateTable(QUEUE_TABLE)
        .set({
          status: statuses.leased,
          lease_owner: owner,
          lease_expires_at: leaseExpires,
          heartbeat_at: now,
          updated_at: now,
        })
        .where(
          'id',
          'in',
          locked.map((task) => task.id),
        )
        .returningAll()
        .execute();
      const workspaces = [...new Set(claimed.map((task) => task.workspace_id))].sort(compareText);
      await trx
        .insertInto('queue_workspace_turns')
        .values(
          workspaces.map((workspaceId) => ({
            id: randomUUID(),
            queue_name: QUEUE_TABLE,
            workspace_id: workspaceId,
            last_claimed_at: now,
            created_at: now,
          })),
        )
        .onConflict((conflict) =>
          conflict.constraint('uq_queue_workspace_turn').doUpdateSet({
            last_claimed_at: sql`greatest(queue_workspace_turns.last_claimed_at, ${now})`,
          }),
        )
        .execute();
      // Keep the claim's own order; RETURNING does not promise one.
      const byId = new Map(claimed.map((task) => [task.id, task]));
      return locked.map((task) => byId.get(task.id)!);
    });
  }

  /** Move a leased row this owner still holds to `running`. */
  async markRunning(taskId: string, owner: string): Promise<boolean> {
    const now = this.#now();
    const updated = await this.#db
      .updateTable(QUEUE_TABLE)
      .set({ status: statuses.running, heartbeat_at: now, updated_at: now })
      .where('id', '=', taskId)
      .where('lease_owner', '=', owner)
      .where('status', '=', statuses.leased)
      .executeTakeFirst();
    return updated.numUpdatedRows > 0n;
  }

  /** Extend the lease of a leased or running row this owner still holds. */
  async heartbeat(taskId: string, owner: string): Promise<boolean> {
    const now = this.#now();
    const updated = await this.#db
      .updateTable(QUEUE_TABLE)
      .set({
        heartbeat_at: now,
        lease_expires_at: addSeconds(now, this.#leaseTtlSeconds),
        updated_at: now,
      })
      .where('id', '=', taskId)
      .where('lease_owner', '=', owner)
      .where('status', 'in', [statuses.leased, statuses.running])
      .executeTakeFirst();
    return updated.numUpdatedRows > 0n;
  }

  /** Whether the row reached a terminal status (cooperative cancel). */
  async isTerminal(taskId: string): Promise<boolean> {
    const row = await this.#db
      .selectFrom(QUEUE_TABLE)
      .select('status')
      .where('id', '=', taskId)
      .executeTakeFirst();
    return row !== undefined && policy.task_queue.terminal.includes(row.status);
  }
}
