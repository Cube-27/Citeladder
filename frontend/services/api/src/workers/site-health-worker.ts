/**
 * Disjoint SiteCrawlTask claims handed to the one Site Health task runner, and
 * the crawl lifecycle. Each settled discovery or analysis task is reconciled
 * by its crawl's own single-flight chain, so a freed slot refills at once; lease
 * recovery and the stalled, overdue and cancelled crawl backstops run as one
 * single-flight background job on a timer, off the claim path.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { cachedWorkspaceAccess } from '../entitlements/access.ts';
import { getLogger } from '../logging.ts';
import {
  SITE_HEALTH_LANE,
  TaskQueue,
  type ClaimFilter,
  type SiteTask,
} from '../queue/task-queue.ts';
import { persistLinkMetrics } from '../site-health/link-metrics.ts';
import { persistArchitecture } from '../site-health/architecture.ts';
import { runAnalyze } from '../site-health/analyze-task.ts';
import { runDiscover } from '../site-health/discover-task.ts';
import { runSiteSetup } from '../site-health/site-setup-task.ts';
import { runFinalize } from '../site-health/finalize-task.ts';
import { runSiteTask, type SiteTaskWork } from '../site-health/site-task.ts';
import { SitePageFetcher } from '../site-health/page-fetch.ts';
import { runChangeIntel } from '../site-health/change-snapshot.ts';
import { siteWorkerSettings } from '../site-health/runtime.ts';
import { recoverExpiredLeases } from '../site-health/lease-recovery.ts';
import {
  publishCancelledCrawls,
  reconcileAfterTask,
  reconcileCrawl,
  reconcileOverdue,
  reconcileStalled,
} from '../site-health/lifecycle.ts';
import { crawlCadences, type CrawlCadences } from '../site-health/refresh-cadence.ts';

type TransactionRun = Extract<SiteTaskWork, { kind: 'transaction' }>['run'];
/** Whether another lane of this lane's group has work due now; absent, a window end yields. */
export type PeersDue = () => Promise<boolean>;
/**
 * Every kind the worker runs. Acquiring kinds (and `finalize`, which commits
 * in batches) own their transactions; the rest run inside the runner's
 * transaction.
 */
const WORK: Readonly<Record<string, SiteTaskWork>> = {
  analyze: { kind: 'acquire', run: runAnalyze },
  discover: { kind: 'acquire', run: runDiscover },
  site_setup: { kind: 'acquire', run: runSiteSetup },
  finalize: { kind: 'acquire', run: runFinalize },
  change_intel: { kind: 'transaction', run: runChangeIntel },
  link_metrics: { kind: 'transaction', run: persistLinkMetrics },
  architecture: { kind: 'transaction', run: persistArchitecture },
};
const logger = getLogger('app.workers.site_health_worker');
export class SiteHealthWorker {
  readonly db: Database;
  readonly owner: string;
  readonly settings: ReturnType<typeof siteWorkerSettings>;
  readonly queue: TaskQueue<'site_crawl_tasks'>;
  readonly fetcher: SitePageFetcher;
  readonly #work: Readonly<Record<string, SiteTaskWork>>;
  readonly taskScope?: { workspaceId: string; crawlId: string };
  readonly #where?: ClaimFilter;
  readonly signal?: AbortSignal;
  readonly #cadence: CrawlCadences;
  readonly #access: (workspaceId: string) => Promise<unknown>;
  /** The in-flight upkeep pass; it resolves to the leases it reclaimed. */
  #upkeep: Promise<number> | null = null;
  #upkeepFailures: unknown[] = [];
  #nextRecovery = 0;
  #nextMaintenance = 0;
  /** Each crawl's post-settle reconciles, one at a time in settlement order. */
  readonly #reconciles = new Map<string, Promise<void>>();
  constructor(
    db: Database,
    options: {
      owner?: string;
      settings?: ReturnType<typeof siteWorkerSettings>;
      /** Replacement transaction kinds, by task kind. */
      executors?: Readonly<Record<string, TransactionRun>>;
      fetcher?: SitePageFetcher;
      taskScope?: { workspaceId: string; crawlId: string };
      signal?: AbortSignal;
    } = {},
  ) {
    this.db = db;
    this.taskScope = options.taskScope;
    if (options.taskScope) {
      const { workspaceId, crawlId } = options.taskScope;
      this.#where = (column) =>
        sql<boolean>`${column('workspace_id')} = ${workspaceId} and ${column('crawl_id')} = ${crawlId}`;
    }
    this.signal = options.signal;
    this.owner = options.owner ?? `site-worker-ts-${randomUUID().slice(0, 12)}`;
    this.settings = options.settings ?? siteWorkerSettings();
    this.queue = new TaskQueue(db, SITE_HEALTH_LANE, { leaseTtlSeconds: this.settings.lease });
    this.#cadence = crawlCadences(this.settings.scoreRefresh);
    // The runner checks before every task and acquisitions before every fetch;
    // a short-lived grant spares four queries per check.
    this.#access = cachedWorkspaceAccess(db, (this.settings.accessTtl || 0) * 1000);
    // One fetcher for the worker: robots caching and per-host pacing span every task.
    this.fetcher = options.fetcher ?? new SitePageFetcher(db);
    const replaced = Object.entries(options.executors ?? {}).map(
      ([kind, run]): [string, SiteTaskWork] => [kind, { kind: 'transaction', run }],
    );
    this.#work = { ...WORK, ...Object.fromEntries(replaced) };
  }
  /** One claim pass: up to `limit` tasks, each settled and reconciled before returning. */
  async runOnce(limit = this.settings.concurrency, canAdmit: () => boolean = () => true) {
    return this.#withUpkeep(async () => (canAdmit() ? this.#claimAndExecute(limit) : 0));
  }
  /**
   * Like `runOnce`, but refills each freed slot while the caller admits, within
   * the claim window. At the window's end the pass keeps its group's turn for
   * another window while no peer has due work.
   */
  async drain(
    limit = this.settings.concurrency,
    canAdmit: () => boolean = () => true,
    peersDue?: PeersDue,
  ) {
    return this.#withUpkeep(async () =>
      canAdmit() ? this.#claimAndExecute(limit, { refillWhile: canAdmit, peersDue }) : 0,
    );
  }
  /**
   * Keep up to `limit` tasks in flight: each settlement frees a slot that the
   * next claim refills, so one slow fetch never idles the others. Successors a
   * task enqueues, or its crawl's reconcile does, become claimable on the next
   * refill. Refills stop once the caller stops admitting or the claim window
   * ends with a peer due; claimed work always settles.
   */
  async #claimAndExecute(
    limit: number,
    options: { refillWhile: () => boolean; peersDue?: PeersDue } = { refillWhile: () => false },
  ) {
    const windowMs = this.settings.claimWindow * 1000;
    let windowEnd = performance.now() + windowMs;
    const refill = async () => {
      if (!options.refillWhile() || this.signal?.aborted) return false;
      if (performance.now() < windowEnd) return true;
      if (!options.peersDue || (await this.#peersDue(options.peersDue))) return false;
      windowEnd = performance.now() + windowMs;
      // Admission may have closed during the probe.
      return options.refillWhile() && !this.signal?.aborted;
    };
    const inFlight = new Set<Promise<void>>();
    const failures: unknown[] = [];
    let claimed = 0;
    const claim = async () => {
      let tasks: SiteTask[];
      try {
        tasks = await this.queue.claim({
          owner: this.owner,
          kinds: policy.site_health.ts_owned_task_kinds,
          limit: limit - inFlight.size,
          where: this.#where,
        });
      } catch (error) {
        // In-flight work still settles before the failure surfaces.
        failures.push(error);
        return;
      }
      claimed += tasks.length;
      for (const task of tasks) {
        const running: Promise<void> = this.#settle(task)
          .then(() => undefined)
          .catch((error: unknown) => {
            failures.push(error);
          })
          .finally(() => inFlight.delete(running));
        inFlight.add(running);
      }
    };
    await claim();
    while (inFlight.size) {
      await Promise.race(inFlight); // NOSONAR -- Wait for the next free slot.
      if (failures.length) continue;
      // The last slot freed: its crawl's reconcile may enqueue the next work (a finalize).
      if (!inFlight.size) await this.#reconciled(); // NOSONAR -- Successors first.
      // Admission is checked after every wait, immediately before the claim.
      if (await refill()) await claim(); // NOSONAR -- One refill per settlement.
    }
    if (failures.length) throw failures[0];
    return claimed;
  }
  /** At a window end the probe decides; a failed probe yields the turn. */
  async #peersDue(peersDue: PeersDue) {
    try {
      return await peersDue();
    } catch (error) {
      logger.exception('site health peer probe failed', error);
      return true;
    }
  }
  /** When the earliest task becomes available (deferred analysis, retry backoff) or its lease expires. */
  nextDue(): Promise<Date | null> {
    const scope = this.taskScope;
    return this.queue.nextDue(
      policy.site_health.ts_owned_task_kinds,
      scope ? sql`workspace_id = ${scope.workspaceId} and crawl_id = ${scope.crawlId}` : undefined,
    );
  }
  /**
   * Run `body` with the upkeep job ticking beside it. The pass is awaited
   * before returning, as are the crawls' reconciles, so even an empty drain
   * runs the backstops and no background query outlives the caller's pool.
   */
  async #withUpkeep(body: () => Promise<number>) {
    this.#kickUpkeep();
    const timer = setInterval(() => this.#kickUpkeep(), Math.max(50, this.settings.poll * 1000));
    let result: number;
    try {
      result = await body();
    } finally {
      clearInterval(timer);
      await this.#upkeep;
      await this.#reconciled();
    }
    // A recovery failure fails the pass, as it did when recovery ran inline.
    const [failure] = this.#upkeepFailures.splice(0);
    if (failure) throw failure;
    return result;
  }
  /** Start the upkeep pass when part of it is due and none is in flight; slots never wait for it. */
  #kickUpkeep() {
    if (this.#upkeep) return;
    const now = Date.now();
    if (now < this.#nextRecovery && now < this.#nextMaintenance) return;
    this.#upkeep = this.#runUpkeep()
      .catch((error: unknown) => {
        this.#upkeepFailures.push(error);
        return 0;
      })
      .finally(() => {
        this.#upkeep = null;
      });
  }
  /** The pass in flight, or one started now if due; resolves to the leases it reclaimed. */
  async #upkeepPass() {
    this.#kickUpkeep();
    return (await this.#upkeep) ?? 0;
  }
  async #runUpkeep() {
    const reclaimed = Date.now() >= this.#nextRecovery ? await this.#recover() : 0;
    if (Date.now() >= this.#nextMaintenance) await this.#maintain();
    return reclaimed;
  }
  async #recover() {
    const result = await recoverExpiredLeases(
      this.db,
      this.settings.reclaimBatch,
      new Date(),
      this.taskScope,
    );
    this.#nextRecovery =
      result.reclaimed === this.settings.reclaimBatch
        ? 0
        : Date.now() + Math.max(50, this.settings.poll * 1000);
    // A lease recovered at its attempt ceiling settles a task no executor will reconcile.
    for (const crawl of result.failedCrawls) {
      const reconcile = () => reconcileCrawl(this.db, crawl.workspaceId, crawl.crawlId);
      await this.#guard('recovered crawl reconcile failed', reconcile); // NOSONAR -- One crawl lock at a time, each in its own transaction.
    }
    return result.reclaimed;
  }
  /** Crawl backstops, at most once per backstop interval. */
  async #maintain() {
    const lifecycle = this.settings.lifecycle;
    try {
      if (this.taskScope) {
        // Its tasks' reconciles finalize a scoped crawl; this is a safety net on the score cadence.
        const { workspaceId, crawlId } = this.taskScope;
        const refreshScore = this.#cadence.score.admits(crawlId);
        await this.#guard('scoped crawl reconcile failed', () =>
          reconcileCrawl(this.db, workspaceId, crawlId, { refreshScore }),
        );
        return;
      }
      await this.#guard('stalled crawl reconcile failed', () =>
        reconcileStalled(this.db, lifecycle),
      );
      await this.#guard('overdue crawl reconcile failed', () =>
        reconcileOverdue(this.db, lifecycle),
      );
      await this.#guard('cancelled crawl publication failed', () =>
        publishCancelledCrawls(this.db, lifecycle.batch),
      );
    } finally {
      this.#nextMaintenance = Date.now() + Math.max(50, this.settings.backstopInterval * 1000);
    }
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
    const admit = () => !signal.aborted && performance.now() < deadline;
    return this.#withUpkeep(async () => {
      let total = 0;
      while (admit()) {
        const count = await this.#claimAndExecute(this.settings.concurrency, {
          refillWhile: admit,
        });
        total += count;
        // An empty claim is idle only once the upkeep pass reclaimed nothing more to claim.
        if (!count && !(await this.#upkeepPass())) break; // NOSONAR -- Recovery batches drain in turn.
      }
      return total;
    });
  }
  /** Run one claimed task through the Site Health task runner, then its crawl's reconcile. */
  async execute(claimed: SiteTask) {
    const { reconciled } = await this.#settle(claimed);
    await reconciled;
  }
  /**
   * Settle a task; its crawl's reconcile is chained, not awaited, so the slot
   * frees at once. The chain runs after the settlement commits; the stalled
   * backstop covers a crash in between.
   */
  async #settle(claimed: SiteTask) {
    const kind = claimed.task_kind;
    const work: SiteTaskWork = Object.hasOwn(this.#work, kind)
      ? this.#work[kind]!
      : {
          kind: 'transaction',
          run: () => Promise.reject(new Error(`Site Health task '${kind}' has no executor`)),
        };
    await runSiteTask(
      {
        db: this.db,
        owner: this.owner,
        queue: this.queue,
        fetcher: this.fetcher,
        settings: this.settings,
        checkAccess: () => this.#access(claimed.workspace_id),
        cadence: this.#cadence,
        signal: this.signal,
      },
      claimed,
      work,
    );
    return { reconciled: work.kind === 'acquire' ? this.#reconcile(claimed) : Promise.resolve() };
  }
  /** Chain a settled task's reconcile behind its crawl's earlier ones; it never rejects. */
  #reconcile(task: SiteTask) {
    const previous = this.#reconciles.get(task.crawl_id) ?? Promise.resolve();
    const next = previous.then(() =>
      this.#guard('site health crawl reconcile failed', () =>
        reconcileAfterTask(this.db, task, this.#cadence),
      ),
    );
    this.#reconciles.set(task.crawl_id, next);
    void next.then(() => {
      if (this.#reconciles.get(task.crawl_id) === next) this.#reconciles.delete(task.crawl_id);
    });
    return next;
  }
  /** Every chained reconcile, including ones chained while waiting. */
  async #reconciled() {
    while (this.#reconciles.size) await Promise.all(this.#reconciles.values()); // NOSONAR -- Chains may grow while awaited.
  }
}
