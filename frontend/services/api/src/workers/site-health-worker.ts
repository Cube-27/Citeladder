/**
 * Disjoint SiteCrawlTask claims, heartbeat, atomic evidence/successor
 * acknowledgement, and the crawl lifecycle: each settled discovery or analysis
 * task is reconciled, and every pass runs the stalled, overdue and cancelled
 * crawl backstops.
 */
import { randomInt, randomUUID } from 'node:crypto';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { TaskQueue, type SiteTask } from '../queue/task-queue.ts';
import { persistLinkMetrics } from '../site-health/link-metrics.ts';
import { persistArchitecture } from '../site-health/architecture.ts';
import { runAnalyze } from '../site-health/analyze-task.ts';
import { runDiscover } from '../site-health/discover-task.ts';
import { runSiteSetup } from '../site-health/site-setup-task.ts';
import { siteTaskSettings, type SiteTaskContext } from '../site-health/site-task.ts';
import { SitePageFetcher } from '../site-health/page-fetch.ts';
import { runChangeIntel } from '../site-health/change-snapshot.ts';
import { siteWorkerSettings } from '../site-health/runtime.ts';
import { lockSiteTask, type Crawl } from '../site-health/task-fence.ts';
import { TaskCancelledError } from './executor.ts';
import { waitForPoll } from './poll.ts';
import { recoverExpiredLeases } from '../site-health/lease-recovery.ts';
import {
  publishCancelledCrawls,
  reconcileAfterTask,
  reconcileCrawl,
  reconcileOverdue,
  reconcileStalled,
  ScoreRefreshCadence,
} from '../site-health/lifecycle.ts';

type SiteExecutor = (db: Database, crawl: Crawl, task: SiteTask) => Promise<unknown>;
const executors: Record<string, SiteExecutor> = {
  change_intel: runChangeIntel,
  link_metrics: persistLinkMetrics,
  architecture: persistArchitecture,
};
/** Kinds that acquire over the network: each owns its transactions and marks itself running. */
const acquisition: Record<string, (ctx: SiteTaskContext, task: SiteTask) => Promise<void>> = {
  analyze: runAnalyze,
  discover: runDiscover,
  site_setup: runSiteSetup,
};
const logger = getLogger('app.workers.site_health_worker');
/** Uniform jitter in [0, seconds), millisecond resolution. */
const jitter = (seconds: number) => randomInt(Math.max(1, Math.round(seconds * 1000))) / 1000;
function conflict(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return typeof code === 'string' && ['40001', '40P01', '55P03'].includes(code);
}
export class SiteHealthWorker {
  readonly db: Database;
  readonly owner: string;
  readonly settings: ReturnType<typeof siteWorkerSettings>;
  readonly queue: TaskQueue<'site_crawl_tasks'>;
  readonly executors: Record<string, SiteExecutor>;
  readonly acquisition: SiteTaskContext;
  readonly #cadence: ScoreRefreshCadence;
  #recovery: Promise<number> | null = null;
  #nextRecovery = 0;
  #maintenance: Promise<void> | null = null;
  #nextMaintenance = 0;
  constructor(
    db: Database,
    options: {
      owner?: string;
      settings?: ReturnType<typeof siteWorkerSettings>;
      executors?: Record<string, SiteExecutor>;
      fetcher?: SitePageFetcher;
    } = {},
  ) {
    this.db = db;
    this.owner = options.owner ?? `site-worker-ts-${randomUUID().slice(0, 12)}`;
    this.settings = options.settings ?? siteWorkerSettings();
    this.executors = options.executors ?? executors;
    this.queue = new TaskQueue(db, { leaseTtlSeconds: this.settings.lease }, 'site_crawl_tasks');
    this.#cadence = new ScoreRefreshCadence(this.settings.scoreRefresh);
    // One fetcher for the worker: robots caching and per-host pacing span every task.
    this.acquisition = {
      db,
      owner: this.owner,
      fetcher: options.fetcher ?? new SitePageFetcher(db),
      settings: siteTaskSettings(),
    };
  }
  async runOnce(limit = this.settings.concurrency) {
    await this.#recover();
    await this.#maintain();
    return this.#claimAndExecute(limit);
  }
  async #claimAndExecute(limit: number) {
    const tasks = await this.queue.claim({
      owner: this.owner,
      kinds: policy.site_health.ts_owned_task_kinds,
      limit,
    });
    const results = await Promise.allSettled(tasks.map((task) => this.execute(task)));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    return tasks.length;
  }
  async #recover() {
    if (this.#recovery) return this.#recovery;
    if (Date.now() < this.#nextRecovery) return 0;
    this.#recovery = recoverExpiredLeases(this.db, this.settings.reclaimBatch)
      .then(async (result) => {
        this.#nextRecovery =
          result.reclaimed === this.settings.reclaimBatch
            ? 0
            : Date.now() + Math.max(50, this.settings.poll * 1000);
        // A lease recovered at its attempt ceiling settles a task no executor will reconcile.
        for (const crawl of result.failedCrawls)
          await this.#guard('recovered crawl reconcile failed', () =>
            reconcileCrawl(this.db, crawl.workspaceId, crawl.crawlId),
          );
        return result.reclaimed;
      })
      .finally(() => {
        this.#recovery = null;
      });
    return this.#recovery;
  }
  /** Crawl backstops, at most once per poll interval across this worker's slots. */
  async #maintain() {
    if (this.#maintenance) return this.#maintenance;
    if (Date.now() < this.#nextMaintenance) return;
    const lifecycle = this.settings.lifecycle;
    this.#maintenance = (async () => {
      await this.#guard('stalled crawl reconcile failed', () =>
        reconcileStalled(this.db, lifecycle),
      );
      await this.#guard('overdue crawl reconcile failed', () =>
        reconcileOverdue(this.db, lifecycle),
      );
      await this.#guard('cancelled crawl publication failed', () =>
        publishCancelledCrawls(this.db, lifecycle.batch),
      );
    })().finally(() => {
      this.#nextMaintenance = Date.now() + Math.max(50, this.settings.poll * 1000);
      this.#maintenance = null;
    });
    return this.#maintenance;
  }
  /** One failed backstop must not suppress the others or the claim loop. */
  async #guard(message: string, body: () => Promise<unknown>) {
    try {
      await body();
    } catch (error) {
      logger.exception(message, error);
    }
  }
  /** Stop new claims at the deadline; finish bounded in-flight work and close cleanly. */
  async runUntilIdle(signal: AbortSignal, budgetSeconds = this.settings.drainBudget) {
    if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0)
      throw new Error('Site Health drain budget must be positive and finite');
    const deadline = performance.now() + budgetSeconds * 1000;
    let total = 0;
    while (!signal.aborted && performance.now() < deadline) {
      const recovered = await this.#recover();
      // Maintenance runs even on an empty queue, so a drain still finalizes stalled crawls.
      await this.#maintain();
      if (signal.aborted || performance.now() >= deadline) break;
      const count = await this.#claimAndExecute(this.settings.concurrency);
      total += count;
      if (!count && recovered < this.settings.reclaimBatch) break;
    }
    return total;
  }
  async execute(claimed: SiteTask) {
    const acquire = Object.hasOwn(acquisition, claimed.task_kind)
      ? acquisition[claimed.task_kind]
      : undefined;
    if (acquire) {
      await this.#leased(claimed, () => acquire(this.acquisition, claimed));
      // After the settlement commits; the stalled backstop covers a crash in between.
      await this.#guard('site health crawl reconcile failed', () =>
        reconcileAfterTask(this.db, claimed, this.#cadence),
      );
      return;
    }
    if (!(await this.queue.markRunning(claimed.id, this.owner))) return;
    await this.#leased(claimed, () => this.#executeInTransaction(claimed));
  }
  /** Heartbeat the lease for the whole body; a failure settles the task. */
  async #leased(claimed: SiteTask, body: () => Promise<void>) {
    const beat: { pending: Promise<unknown> | null } = { pending: null };
    const timer = setInterval(() => {
      if (beat.pending) return;
      beat.pending = this.queue
        .heartbeat(claimed.id, this.owner)
        .catch((error: unknown) =>
          logger.exception('heartbeat failed; retrying', error, { task_id: claimed.id }),
        )
        .finally(() => {
          beat.pending = null;
        });
    }, this.settings.heartbeat * 1000);
    try {
      await body();
    } catch (error) {
      if (!(error instanceof TaskCancelledError)) {
        logger.exception('site health task failed', error, { task_id: claimed.id });
        await this.fail(claimed, error);
      }
    } finally {
      clearInterval(timer);
      await beat.pending;
    }
  }
  async #executeInTransaction(claimed: SiteTask) {
    await this.db.transaction().execute(async (trx) => {
      const { crawl, task } = await lockSiteTask(trx, claimed, this.owner, 'fence');
      const executor = Object.hasOwn(this.executors, task.task_kind)
        ? this.executors[task.task_kind]
        : undefined;
      if (!executor) throw new Error(`Site Health task '${task.task_kind}' has no executor`);
      await executor(trx, crawl, task);
      await lockSiteTask(trx, claimed, this.owner, 'acknowledge');
      await trx
        .updateTable('site_crawl_tasks')
        .set({
          status: 'succeeded',
          attempt_count: task.attempt_count + 1,
          completed_at: new Date(),
          updated_at: new Date(),
          error_code: '',
          error_detail: '',
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
        })
        .where('id', '=', task.id)
        .where('workspace_id', '=', task.workspace_id)
        .execute();
    });
  }
  async fail(claimed: SiteTask, error: unknown) {
    await this.db.transaction().execute(async (trx) => {
      let held: Awaited<ReturnType<typeof lockSiteTask>>;
      try {
        held = await lockSiteTask(trx, claimed, this.owner);
      } catch (lost) {
        if (lost instanceof TaskCancelledError) return;
        throw lost;
      }
      const { task } = held;
      const settings = this.settings;
      const contention = conflict(error);
      const conflicts = task.conflict_count + Number(contention);
      const attempt = task.attempt_count + Number(!contention);
      const retry = contention ? conflicts <= settings.conflictMax : attempt < task.max_attempts;
      const delay = contention
        ? settings.conflictBase + jitter(settings.conflictJitter)
        : Math.min(settings.retryMax, settings.retryBase * 2 ** Math.max(0, attempt - 1)) +
          jitter(settings.retryJitter);
      const now = new Date();
      await trx
        .updateTable('site_crawl_tasks')
        .set({
          status: retry ? 'retry_wait' : 'failed',
          conflict_count: conflicts,
          attempt_count: attempt,
          completed_at: retry ? null : now,
          updated_at: now,
          available_at: new Date(now.getTime() + delay * 1000),
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
          error_code: contention ? 'db_conflict' : 'task_failed',
          error_detail:
            error instanceof Error ? error.message.slice(0, 2000) : 'Site Health task failed',
        })
        .where('id', '=', task.id)
        .where('workspace_id', '=', task.workspace_id)
        .execute();
    });
  }
  /**
   * Keep `concurrency` tasks in flight, each slot claiming one task as it
   * finishes the last, so a slow page fetch never holds a whole batch.
   */
  async runForever(signal: AbortSignal) {
    logger.info('site health worker started', { owner: this.owner });
    const slot = async () => {
      while (!signal.aborted) {
        let count = 0;
        try {
          count = await this.runOnce(1); // NOSONAR: each slot claims its next task only after finishing the last.
        } catch (error) {
          logger.exception('site health iteration failed', error);
        }
        if (!count) await waitForPoll(Math.max(50, this.settings.poll * 1000), signal);
      }
    };
    await Promise.all(Array.from({ length: this.settings.concurrency }, slot));
  }
}
