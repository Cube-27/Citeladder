/**
 * The TypeScript analytics worker: claims the kinds `core/config/analytics.py`
 * assigns to TypeScript and runs each through its executor.
 *
 * Mirrors `app/workers/analytics_worker.py` on the queue lifecycle: the claim
 * commits before any work, a row already terminal at claim time is never
 * dispatched, the lease is marked running and heartbeated while the executor
 * runs, and one locked finalize per dispatch is the only terminal writer. It
 * re-checks owner and status (a lost lease or a terminal row writes nothing)
 * and counts the attempt exactly once. The Python sweeper still reclaims
 * expired leases for every kind.
 */
import { randomBytes } from 'node:crypto';

import { policy, type WorkerSettings } from '../config.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { TaskQueue, type QueueTask } from '../queue/task-queue.ts';
import { classifyReferrals } from '../referrals/classify.ts';
import { ingestReferrals } from '../referrals/ingest.ts';
import { referralRetentionSweep } from '../referrals/retention.ts';
import { refreshAiReferralsSnapshot } from '../referrals/snapshot.ts';
import { TaskCancelledError, type Executor } from './executor.ts';
import { projectPerformanceRange, refreshTrafficSnapshot } from '../traffic/snapshot.ts';
import { recomputeDemand } from '../demand/snapshot.ts';
import { refreshOpportunities } from '../opportunities/refresh.ts';
import { verifyImplementationEvents } from '../opportunities/verification.ts';

const logger = getLogger('workers.analytics');
const { statuses, terminal } = policy.task_queue;
const ERROR_DETAIL_LIMIT = 2000;

/** Kind dispatch: exactly the kinds TypeScript owns. */
export const EXECUTORS: Readonly<Record<string, Executor>> = {
  ingest_referrals: ingestReferrals,
  classify_referrals: classifyReferrals,
  ai_referrals_snapshot_refresh: refreshAiReferralsSnapshot,
  referral_retention_sweep: referralRetentionSweep,
  traffic_snapshot_refresh: refreshTrafficSnapshot,
  performance_range_projection: projectPerformanceRange,
  demand_snapshot_refresh: recomputeDemand,
  opportunity_refresh: refreshOpportunities,
  opportunity_verification: verifyImplementationEvents,
};

/** A claimed kind with no executor: a deploy bug, failed without retries. */
class ExecutorNotWiredError extends Error {}

const detail = (error: Error) => [...String(error.message)].slice(0, ERROR_DETAIL_LIMIT).join('');

export class AnalyticsWorker {
  readonly owner: string;
  readonly #db: Database;
  readonly #queue: TaskQueue;
  readonly #settings: WorkerSettings;
  readonly #executors: Readonly<Record<string, Executor>>;

  constructor(
    db: Database,
    settings: WorkerSettings,
    options: { owner?: string; executors?: Readonly<Record<string, Executor>> } = {},
  ) {
    this.#db = db;
    this.#settings = settings;
    this.#queue = new TaskQueue(db, { leaseTtlSeconds: settings.leaseTtlSeconds });
    this.#executors = options.executors ?? EXECUTORS;
    this.owner = options.owner ?? `analytics-worker-ts-${randomBytes(6).toString('hex')}`;
  }

  /** Claim one row of a TypeScript-owned kind and run it; the count run. */
  async runOnce(): Promise<number> {
    const rows = await this.#queue.claim({
      owner: this.owner,
      kinds: policy.analytics.ts_owned_task_kinds,
    });
    for (const row of rows) await this.#execute(row);
    return rows.length;
  }

  /** Drain until a claim returns nothing (tests and one-shot runs). */
  async runUntilIdle(maxBatches = 1000): Promise<number> {
    let total = 0;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const ran = await this.runOnce();
      if (ran === 0) break;
      total += ran;
    }
    return total;
  }

  /** Poll until `signal` aborts; the task in hand always finishes first. */
  async runForever(signal: AbortSignal): Promise<void> {
    logger.info('analytics_worker_started', { owner: this.owner });
    while (!signal.aborted) {
      let ran = 0;
      try {
        ran = await this.runOnce();
      } catch (error) {
        // A bad row must not kill the loop.
        logger.exception('analytics_worker_iteration_failed', error);
      }
      if (ran === 0) await sleep(Math.max(50, this.#settings.pollIntervalSeconds * 1000), signal);
    }
    logger.info('analytics_worker_stopped', { owner: this.owner });
  }

  async #execute(claimed: QueueTask): Promise<void> {
    try {
      // Cooperative cancel at the boundary: a row that turned terminal between
      // enqueue and claim is never dispatched.
      if (await this.#queue.isTerminal(claimed.id)) return;
      if (!(await this.#queue.markRunning(claimed.id, this.owner))) return;
      await this.#finalize(claimed.id, await this.#run(claimed));
    } catch (error) {
      logger.exception('analytics_task_crashed', error, { task_id: claimed.id });
      await this.#finalize(claimed.id, error as Error).catch(() => undefined);
    }
  }

  /** Run the executor under a heartbeat; the error it raised, if any. */
  async #run(claimed: QueueTask): Promise<Error | null> {
    const executor = Object.hasOwn(this.#executors, claimed.task_kind)
      ? this.#executors[claimed.task_kind]
      : undefined;
    const heartbeat = setInterval(
      () => {
        this.#queue.heartbeat(claimed.id, this.owner).catch((error: unknown) => {
          // A dead heartbeat silently expires the lease; keep beating instead.
          logger.exception('analytics_heartbeat_failed', error, { task_id: claimed.id });
        });
      },
      Math.max(1, this.#settings.heartbeatIntervalSeconds) * 1000,
    );
    try {
      if (executor === undefined) {
        throw new ExecutorNotWiredError(
          `analytics task kind '${claimed.task_kind}' has no registered executor`,
        );
      }
      await executor(claimed, {
        db: this.#db,
        maxAttempts: this.#settings.taskMaxAttempts,
        checkCancelled: async (boundary) => {
          if (await this.#queue.isTerminal(claimed.id)) {
            throw new TaskCancelledError(
              `analytics task ${claimed.id} reached a terminal status; stopping at the ${boundary} boundary`,
            );
          }
        },
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** The one locked terminal write per dispatch. */
  async #finalize(taskId: string, error: Error | null): Promise<boolean> {
    return this.#db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('analytics_tasks')
        .select(['lease_owner', 'status', 'attempt_count', 'max_attempts'])
        .where('id', '=', taskId)
        .forUpdate()
        .executeTakeFirst();
      if (row === undefined || row.lease_owner !== this.owner || terminal.includes(row.status)) {
        return false;
      }
      const now = new Date();
      const attempt = row.attempt_count + 1;
      const outcome =
        error === null
          ? { status: statuses.succeeded, completed_at: now, error_code: '', error_detail: '' }
          : error instanceof ExecutorNotWiredError
            ? {
                // Permanent until a deploy: terminal without spending retries.
                status: statuses.failed,
                completed_at: now,
                error_code: policy.analytics.executor_not_wired_error,
                error_detail: detail(error),
              }
            : attempt < row.max_attempts
              ? {
                  status: statuses.retry_wait,
                  available_at: new Date(now.getTime() + this.#settings.retryDelaySeconds * 1000),
                  error_code: policy.analytics.retry_error,
                  error_detail: detail(error),
                }
              : {
                  status: statuses.failed,
                  completed_at: now,
                  error_code: policy.task_queue.max_attempts_error,
                  error_detail: detail(error),
                };
      await trx
        .updateTable('analytics_tasks')
        .set({
          ...outcome,
          attempt_count: attempt,
          lease_owner: null,
          lease_expires_at: null,
          updated_at: now,
        })
        .where('id', '=', taskId)
        .execute();
      return true;
    });
  }
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    // The signal lives as long as the process: remove the listener however the
    // sleep ends, or every idle poll leaves one behind.
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
