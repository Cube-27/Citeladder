/**
 * The PostgreSQL task queue for `analytics_tasks` (invariant 8).
 *
 * Ports the claim, lease and heartbeat of
 * `backend/app/orchestration/postgres_task_queue.py`, which keeps serving
 * every other queue. Both stacks claim from the same table with disjoint kind
 * sets (`ANALYTICS_TS_OWNED_TASK_KINDS`), so this module must make exactly the
 * same promises: a claim locks eligible rows `FOR UPDATE SKIP LOCKED`, commits
 * before the caller does any work, and gives each workspace one task before
 * any workspace gets a second. Site Health owns its lease recovery; analytics
 * leases still expire through the Python sweeper.
 */
import { randomUUID } from 'node:crypto';

import { sql, type Selectable, type Kysely } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type {
  AnalyticsTasks,
  SiteCrawlTasks,
  QueueWorkspaceTurns,
} from '../generated/db-schema.ts';
import { compareText } from '../text-order.ts';

export type QueueTask = Selectable<AnalyticsTasks>;
export type SiteTask = Selectable<SiteCrawlTasks>;
type QueueTable = 'analytics_tasks' | 'site_crawl_tasks';
type TaskFor<T extends QueueTable> = T extends 'site_crawl_tasks' ? SiteTask : QueueTask;
// Queries in this owner touch only the lease projection shared by both tables.
type LeaseColumns = Pick<
  AnalyticsTasks,
  | 'id'
  | 'workspace_id'
  | 'task_kind'
  | 'status'
  | 'priority'
  | 'available_at'
  | 'randomized_position'
  | 'lease_owner'
  | 'lease_expires_at'
  | 'heartbeat_at'
  | 'updated_at'
>;
type QueueDatabase = Kysely<{
  analytics_tasks: LeaseColumns;
  site_crawl_tasks: LeaseColumns;
  queue_workspace_turns: QueueWorkspaceTurns;
}>;
function queueDatabase(db: Database) {
  return db as unknown as QueueDatabase;
}

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
  table: QueueTable = QUEUE_TABLE,
) {
  const { now, limit, kinds } = options;
  const queueDb = queueDatabase(db);
  const ranked = queueDb
    .selectFrom(table)
    .select([
      'id as task_id',
      sql<number>`row_number() over (partition by workspace_id order by priority desc, available_at asc, randomized_position asc, id asc)`.as(
        'workspace_position',
      ),
    ])
    .where('status', 'in', claimable)
    .where('available_at', '<=', now)
    .where('task_kind', 'in', kinds)
    .as('fair_queue_candidates');
  return (
    queueDb
      .selectFrom(`${table} as queued`)
      .innerJoin(ranked, 'fair_queue_candidates.task_id', 'queued.id')
      .leftJoin('queue_workspace_turns', (join) =>
        join
          .on('queue_workspace_turns.queue_name', '=', table)
          .onRef('queue_workspace_turns.workspace_id', '=', 'queued.workspace_id'),
      )
      .selectAll('queued')
      .where('queued.status', 'in', claimable)
      .where('queued.available_at', '<=', now)
      // One task per workspace before any workspace receives its second.
      .orderBy('fair_queue_candidates.workspace_position', 'asc')
      .orderBy(sql`queue_workspace_turns.last_claimed_at asc nulls first`)
      .orderBy('queued.priority', 'desc')
      .orderBy('queued.available_at', 'asc')
      .orderBy('queued.randomized_position', 'asc')
      .orderBy('queued.id', 'asc')
      .limit(limit)
      .forUpdate('queued')
      .skipLocked()
  );
}

export class TaskQueue<T extends QueueTable = 'analytics_tasks'> {
  readonly #db: Database;
  readonly #leaseTtlSeconds: number;
  readonly #now: () => Date;
  readonly #table: QueueTable;

  constructor(db: Database, options: TaskQueueOptions, table: T = QUEUE_TABLE as T) {
    this.#db = db;
    this.#leaseTtlSeconds = options.leaseTtlSeconds;
    this.#now = options.now ?? (() => new Date());
    this.#table = table;
  }

  /** Claim up to `limit` eligible rows of `kinds` for `owner`, committed. */
  claim(options: {
    owner: string;
    kinds: readonly string[];
    limit?: number;
  }): Promise<TaskFor<T>[]> {
    const { owner, kinds, limit = 1 } = options;
    if (kinds.length === 0) return Promise.resolve([]);
    const now = this.#now();
    const leaseExpires = addSeconds(now, this.#leaseTtlSeconds);
    return this.#db.transaction().execute(async (trx) => {
      const locked = await claimStatement(trx, { now, limit, kinds }, this.#table).execute();
      if (locked.length === 0) return [];
      const claimed = await queueDatabase(trx)
        .updateTable(this.#table)
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
            queue_name: this.#table,
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
      // SELECT/RETURNING * retains the concrete table's additional columns.
      return locked.map((task) => byId.get(task.id)!) as unknown as TaskFor<T>[];
    });
  }

  /** Move a leased row this owner still holds to `running`. */
  async markRunning(taskId: string, owner: string): Promise<boolean> {
    const now = this.#now();
    const updated = await queueDatabase(this.#db)
      .updateTable(this.#table)
      .set({ status: statuses.running, heartbeat_at: now, updated_at: now })
      .where('id', '=', taskId)
      .where('lease_owner', '=', owner)
      .where('status', '=', statuses.leased)
      .where('lease_expires_at', '>', now)
      .executeTakeFirst();
    return updated.numUpdatedRows > 0n;
  }

  /** Extend the lease of a leased or running row this owner still holds. */
  async heartbeat(taskId: string, owner: string): Promise<boolean> {
    const now = this.#now();
    const updated = await queueDatabase(this.#db)
      .updateTable(this.#table)
      .set({
        heartbeat_at: now,
        lease_expires_at: addSeconds(now, this.#leaseTtlSeconds),
        updated_at: now,
      })
      .where('id', '=', taskId)
      .where('lease_owner', '=', owner)
      .where('status', 'in', [statuses.leased, statuses.running])
      .where('lease_expires_at', '>', now)
      .executeTakeFirst();
    return updated.numUpdatedRows > 0n;
  }

  /** Whether the row reached a terminal status (cooperative cancel). */
  async isTerminal(taskId: string): Promise<boolean> {
    const row = await queueDatabase(this.#db)
      .selectFrom(this.#table)
      .select('status')
      .where('id', '=', taskId)
      .executeTakeFirst();
    return row !== undefined && policy.task_queue.terminal.includes(row.status);
  }
}
