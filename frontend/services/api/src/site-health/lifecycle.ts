/**
 * A crawl goes terminal here and in its `finalize` task, nowhere else. Every
 * entry point writes under the crawl row FOR NO KEY UPDATE and short-circuits on a
 * crawl that is no longer active (a stopped one only recounts), so the
 * per-task reconcile, terminal lease recovery, the stalled backstop and the
 * overdue watchdog are idempotent and safe to run concurrently. A drained
 * crawl stays active and enqueues one `finalize` task, which appends the final
 * page revisions in batches and then atomically publishes the snapshot, score
 * summary and terminal status (`finalize-task.ts`). When that task fails for
 * good, the next reconcile ends the crawl failed with the recorded reason.
 */
import { ACTIVE_CRAWL_STATUSES, isActiveCrawl } from '@citeladder/contracts/site-health';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { assessCrawl, LIFECYCLE_KINDS, saveState } from './crawl-assessment.ts';
import { pageRerunSql } from './page-rerun.ts';
import type { CrawlCadences } from './refresh-cadence.ts';
import type { SiteWorkerSettings } from './runtime.ts';
import { publishRunningIssues } from './issue-catalog.ts';
import { taskCounters, type TaskCounters } from './reads/crawl-counters.ts';
import {
  provisionalSummary,
  refreshLiveScoreSummary,
  refreshRunningScoreSummary,
  writeScoreSummary,
  type LiveSummary,
} from './snapshot.ts';
import { CRAWL_COLUMNS, type Crawl } from './site-task.ts';
import {
  persistLiveCounters,
  persistTerminalCounters,
  writeTerminalCounters,
} from './terminal-counters.ts';
import { drainedFinalizeTask, enqueueFinalize, failFinalization } from './terminal-publication.ts';

const logger = getLogger('app.workers.site_health.lifecycle');
const TERMINAL_TASK = policy.task_queue.terminal;
const DISCOVERY_KINDS = ['discover', 'site_setup'];
// Literals, not a bound array: the planner then proves ix_site_crawl_tasks_open's predicate.
const TERMINAL_STATUSES = sql.join(TERMINAL_TASK.map((status) => sql.lit(status)));
const OVERDUE = policy.site_health.page_analysis.acquisition.error_codes.crawl_overdue;

type ReconcileOptions = {
  /**
   * Rebuild the provisional score while work remains. Only a new analysis can
   * change it, and the rebuild reloads the whole measurement projection, so a
   * settled discover or failed analysis skips it.
   */
  refreshScore?: boolean;
};

/** The provisional score a drained crawl publishes beside its `finalize` task, if it rebuilds one. */
type Score = () => Promise<LiveSummary | null>;

/**
 * A drained crawl publishes through its one `finalize` task. One that failed
 * for good (its third attempt, or failed as overdue) ends the crawl failed.
 */
async function settleDrained(db: Database, crawl: Crawl, score: Score) {
  const task = await drainedFinalizeTask(db, crawl);
  if (task && TERMINAL_TASK.includes(task.status)) return failFinalization(db, crawl, task);
  await saveState(db, crawl);
  if (task) return;
  const payload = await score();
  if (payload) await writeScoreSummary(db, crawl, payload);
  await enqueueFinalize(db, crawl, 'drained');
}

/** Reconcile one crawl whose row the caller holds locked. */
async function reconcileLockedCrawl(db: Database, crawl: Crawl, options: ReconcileOptions = {}) {
  // Stop skips a task another transaction holds; its later settlement recounts.
  if (crawl.status === 'cancelled') return persistTerminalCounters(db, crawl);
  if (!isActiveCrawl(crawl.status)) return;
  const rescore = options.refreshScore ?? true;
  const { drained } = await assessCrawl(db, crawl);
  if (drained)
    return settleDrained(db, crawl, async () => (rescore ? provisionalSummary(db, crawl) : null));
  await saveState(db, crawl);
  if (rescore) await refreshLiveScoreSummary(db, crawl);
}

/** A reconcile's crawl-wide reads, made from an unlocked copy of the row. */
type Assessed =
  | { kind: 'settled' }
  | { kind: 'cancelled'; crawl: Crawl; counters: TaskCounters }
  | { kind: 'active'; crawl: Crawl; drained: boolean; score: LiveSummary | null };

async function assessUnlocked(
  db: Database,
  read: Crawl,
  options: ReconcileOptions,
): Promise<Assessed> {
  // A copy: the assessment moves the row's state in memory, and `read` is compared later.
  const crawl = { ...read };
  if (crawl.status === 'cancelled')
    return { kind: 'cancelled', crawl, counters: await taskCounters(db, crawl) };
  if (!isActiveCrawl(crawl.status)) return { kind: 'settled' };
  const { drained } = await assessCrawl(db, crawl);
  const rescore =
    (options.refreshScore ?? true) && !(drained && (await drainedFinalizeTask(db, crawl)));
  return {
    kind: 'active',
    crawl,
    drained,
    score: rescore ? await provisionalSummary(db, crawl) : null,
  };
}

/** Write what `assessUnlocked` read, under the crawl lock of a row no state write moved since. */
async function applyAssessed(db: Database, assessed: Exclude<Assessed, { kind: 'settled' }>) {
  switch (assessed.kind) {
    case 'cancelled':
      return writeTerminalCounters(db, assessed.crawl, assessed.counters);
    case 'active': {
      const { crawl, score } = assessed;
      if (assessed.drained) return settleDrained(db, crawl, async () => score);
      await saveState(db, crawl);
      if (score) await writeScoreSummary(db, crawl, score);
      return;
    }
    default: {
      const unhandled: never = assessed;
      return unhandled;
    }
  }
}

/** NO KEY UPDATE: FOR UPDATE would block the FK checks of every child insert in the crawl. */
function lockCrawl(db: Database, workspaceId: string, crawlId: string) {
  return db
    .selectFrom('site_crawls')
    .select(CRAWL_COLUMNS)
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', crawlId)
    .forNoKeyUpdate()
    .executeTakeFirst();
}

/** Whether a crawl state write landed between the two reads of the row. */
const stateMoved = (read: Crawl, locked: Crawl) =>
  locked.updated_at.getTime() !== read.updated_at.getTime() ||
  (
    [
      'status',
      'discovery_status',
      'analysis_status',
      'admitted_url_count',
      'discovered_url_count',
    ] as const
  ).some((column) => locked[column] !== read[column]);

/**
 * Reconcile a crawl. Its crawl-wide reads (the task summary, the counters, the
 * provisional score) run before the crawl lock every Stop and crawl writer
 * waits on; the lock is taken only to write them. Every crawl state write
 * moves `updated_at`, so a row that moved since the read is assessed again
 * under the lock. A task settled meanwhile changes no row: its own reconcile
 * follows its commit.
 */
export async function reconcileCrawl(
  db: Database,
  workspaceId: string,
  crawlId: string,
  options: ReconcileOptions = {},
) {
  const read = await db
    .selectFrom('site_crawls')
    .select(CRAWL_COLUMNS)
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', crawlId)
    .executeTakeFirst();
  if (!read) return;
  const assessed = await assessUnlocked(db, read, options);
  if (assessed.kind === 'settled') return;
  await db.transaction().execute(async (trx) => {
    const crawl = await lockCrawl(trx, workspaceId, crawlId);
    if (!crawl) return;
    await (stateMoved(read, crawl)
      ? reconcileLockedCrawl(trx, crawl, options)
      : applyAssessed(trx, assessed));
  });
}

type SettledTask = { id: string; crawl_id: string; workspace_id: string };

function settledRow(db: Database, task: SettledTask) {
  return db
    .selectFrom('site_crawl_tasks as t')
    .innerJoin('site_crawls as c', (join) =>
      join.onRef('c.id', '=', 't.crawl_id').onRef('c.workspace_id', '=', 't.workspace_id'),
    )
    .select([
      't.task_kind',
      't.status',
      't.result_artifact_id',
      'c.status as crawl_status',
      'c.analysis_status',
      'c.admitted_url_count',
      sql<boolean>`exists (
        select 1 from site_crawl_tasks o
        where o.crawl_id = t.crawl_id and o.workspace_id = t.workspace_id
          and o.task_kind = any(${LIFECYCLE_KINDS}::text[])
          and o.status not in (${TERMINAL_STATUSES}))`.as('outstanding'),
      sql<boolean>`exists (
        select 1 from site_crawl_tasks o
        where o.crawl_id = t.crawl_id and o.workspace_id = t.workspace_id
          and o.task_kind = any(${DISCOVERY_KINDS}::text[])
          and o.status not in (${TERMINAL_STATUSES}))`.as('discovering'),
    ])
    .where('t.id', '=', task.id)
    .where('t.crawl_id', '=', task.crawl_id)
    .where('t.workspace_id', '=', task.workspace_id)
    .executeTakeFirst();
}

/**
 * What a settled row can change. A discover while discovery continues and an
 * analysis (analyzed, failed or cancelled) while siblings remain move no
 * boundary, only live progress. Anything else may settle discovery, analysis
 * or the crawl.
 */
function settlement(row: NonNullable<Awaited<ReturnType<typeof settledRow>>>) {
  const running = row.crawl_status === 'running';
  if (row.task_kind === 'discover' && running && row.discovering) return 'discovery_progress';
  // Only terminal rows reach here: failed, cancelled, or succeeded with its artifact.
  const analyzed =
    row.task_kind === 'analyze' && (row.status !== 'succeeded' || row.result_artifact_id !== null);
  return analyzed && running && row.analysis_status === 'running' && row.outstanding
    ? 'analysis_progress'
    : 'boundary';
}

/**
 * Reconcile after a lifecycle or finalize task settles, unless its row cannot
 * have moved a boundary. A row still non-terminal (deferred, re-queued, lease
 * lost) is itself the outstanding work; progress-only settlements recount
 * discovery or refresh the live summary on cadence, since taking the crawl
 * lock for each is pure contention with every task commit and the user's
 * Stop. Other settlements update counters and sub-states without rebuilding
 * the score they cannot change. At each boundary and on their own cadence,
 * the live counters an active crawl's reads render are recounted onto its row
 * (CO-3).
 */
/** A running crawl's score and Issues publications, each on its own cadence (CO-7). */
async function publishAnalysisProgress(
  db: Database,
  { task, cadence, pages }: { task: SettledTask; cadence: CrawlCadences; pages: number },
) {
  if (cadence.score.admits(task.crawl_id, { pages })) await refreshRunningScoreSummary(db, task);
  if (cadence.issues.admits(task.crawl_id)) await publishRunningIssues(db, task);
}

export async function reconcileAfterTask(db: Database, task: SettledTask, cadence: CrawlCadences) {
  const row = await settledRow(db, task);
  if (!row || !TERMINAL_TASK.includes(row.status)) return;
  const kind = settlement(row);
  switch (kind) {
    case 'boundary':
      await reconcileCrawl(db, task.workspace_id, task.crawl_id, {
        refreshScore: row.task_kind === 'analyze' && row.status === 'succeeded',
      });
      break;
    case 'discovery_progress':
      if (cadence.discovery.admits(task.crawl_id))
        await reconcileCrawl(db, task.workspace_id, task.crawl_id, {
          refreshScore: false,
        });
      break;
    case 'analysis_progress':
      await publishAnalysisProgress(db, { task, cadence, pages: row.admitted_url_count });
      break;
    default: {
      const unhandled: never = kind;
      return unhandled;
    }
  }
  // The next settlement after a boundary may be far off (a finalize, a backoff).
  if (kind === 'boundary' || cadence.counters.admits(task.crawl_id))
    await persistLiveCounters(db, task);
}

/**
 * Run one backstop's per-crawl work in order. A crawl that fails is logged and
 * skipped so the rest of the batch still settles; it is retried next pass.
 * Returns how many crawls the work acted on (`false` means it skipped one).
 */
async function eachCrawl<T extends { id: string }>(
  crawls: T[],
  failure: string,
  work: (crawl: T) => Promise<unknown>,
) {
  let acted = 0;
  for (const crawl of crawls)
    try {
      if ((await work(crawl)) !== false) acted++; // NOSONAR -- One crawl lock at a time: a batch never holds several crawl rows.
    } catch (error) {
      logger.exception(failure, error, { crawl_id: crawl.id });
    }
  return acted;
}

/**
 * The terminalization backstop: an active crawl with no outstanding work and
 * no write for the stall threshold. Any route that drains a crawl's last task
 * without reconciling it (a process killed between acknowledgement and
 * reconcile, a recovered lease) would otherwise leave it active forever.
 */
export async function reconcileStalled(db: Database, settings: SiteWorkerSettings['lifecycle']) {
  if (settings.stalledSeconds <= 0) return 0;
  const cutoff = new Date(Date.now() - settings.stalledSeconds * 1000);
  const stalled = await db
    .selectFrom('site_crawls as c')
    .select(['c.id', 'c.workspace_id'])
    .where('c.status', 'in', ACTIVE_CRAWL_STATUSES)
    .where('c.updated_at', '<', cutoff)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('site_crawl_tasks as t')
            .select('t.id')
            .whereRef('t.crawl_id', '=', 'c.id')
            .whereRef('t.workspace_id', '=', 'c.workspace_id')
            .where('t.status', 'not in', TERMINAL_TASK),
        ),
      ),
    )
    .orderBy('c.updated_at')
    .limit(settings.batch)
    .execute();
  return eachCrawl(stalled, 'stalled crawl reconcile failed', async (crawl) => {
    logger.warning('reconciling stalled crawl with no outstanding tasks', {
      crawl_id: crawl.id,
    });
    await reconcileCrawl(db, crawl.workspace_id, crawl.id);
  });
}

/**
 * Active crawls that stopped settling tasks (or heartbeating a finalize) for
 * `noProgressSeconds` (longer than a runner gap, so an idle runner never
 * counts as a stall), or that ran
 * past the absolute `overdueSeconds` cap; one crawl when `crawlId` is given.
 */
function overdueCrawls(db: Database, settings: SiteWorkerSettings['lifecycle'], crawlId?: string) {
  const at = (seconds: number) => new Date(Date.now() - seconds * 1000);
  const started = sql<Date>`coalesce(c.started_at, c.created_at)`;
  // A running finalize settles once after many batch commits: its heartbeat is progress.
  const progressed = sql<Date>`greatest(${started}, (select max(greatest(t.completed_at,
      case when t.task_kind = 'finalize' then t.heartbeat_at end))
    from site_crawl_tasks t where t.workspace_id = c.workspace_id and t.crawl_id = c.id))`;
  return db
    .selectFrom('site_crawls as c')
    .select(['c.id', 'c.workspace_id'])
    .where('c.status', 'in', ACTIVE_CRAWL_STATUSES)
    .$if(crawlId !== undefined, (query) => query.where('c.id', '=', crawlId ?? ''))
    .where((eb) =>
      eb.or([
        eb(started, '<', at(settings.overdueSeconds)),
        eb(progressed, '<', at(settings.noProgressSeconds)),
      ]),
    )
    .orderBy('c.created_at')
    .limit(settings.batch)
    .execute();
}

/**
 * Terminalize crawls that stopped making progress or outran their cap (owner,
 * 2026-11-17). The stall backstop only sees drained crawls; one task held
 * non-terminal forever is invisible to it. The scan is a candidate list: each
 * crawl is re-checked under its own lock, its outstanding tasks fail with
 * `crawl_overdue`, and the same transaction reconciles what it gathered. A
 * finalize task failed this way ends the crawl failed.
 */
export async function reconcileOverdue(db: Database, settings: SiteWorkerSettings['lifecycle']) {
  if (settings.overdueSeconds <= 0) return 0;
  const candidates = await overdueCrawls(db, settings);
  return eachCrawl(candidates, 'overdue crawl reconcile failed', async (candidate) => {
    const abandoned = await db.transaction().execute(async (trx) => {
      const crawl = await lockCrawl(trx, candidate.workspace_id, candidate.id);
      if (!crawl || !isActiveCrawl(crawl.status)) return null;
      if (!(await overdueCrawls(trx, settings, crawl.id)).length) return null;
      const now = new Date();
      const failed = await trx
        .updateTable('site_crawl_tasks')
        .set({
          status: 'failed',
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
          completed_at: now,
          updated_at: now,
          error_code: OVERDUE,
          error_detail: 'crawl stopped making progress or exceeded its wall-clock cap',
        })
        .where('workspace_id', '=', crawl.workspace_id)
        .where('crawl_id', '=', crawl.id)
        .where('status', 'not in', TERMINAL_TASK)
        .returning('id')
        .execute();
      await reconcileLockedCrawl(trx, crawl);
      return failed.length;
    });
    if (abandoned === null) return false;
    logger.warning('terminalized overdue crawl', {
      crawl_id: candidate.id,
      abandoned_tasks: abandoned,
    });
    return true;
  });
}

/**
 * A cancelled crawl's measurement evidence is published by a `finalize` task,
 * enqueued here once. The selection mirrors the snapshot writer's own
 * condition (a completed analysis or classification-expected task of an
 * active monitored page), so a crawl with nothing to publish is never chosen.
 * A page rerun writes no snapshot, so its `change_intel` successor marks it
 * published instead. A crawl that already has a finalize task other than the
 * one Stop cancelled is not chosen again: one whose publication failed for
 * good stays cancelled (CO-2).
 */
export async function publishCancelledCrawls(db: Database, batch: number) {
  const pending = await db
    .selectFrom('site_crawls as c')
    .select(['c.id', 'c.workspace_id'])
    .where('c.status', '=', 'cancelled')
    .where(
      sql<boolean>`not exists (
      select 1 from site_health_snapshots s
      where s.crawl_id = c.id and s.workspace_id = c.workspace_id)`,
    )
    .where(
      sql<boolean>`not exists (
      select 1 from site_crawl_tasks t
      where t.crawl_id = c.id and t.workspace_id = c.workspace_id
        and t.task_kind = 'finalize' and t.status <> 'cancelled')`,
    )
    .where(
      sql<boolean>`not (${pageRerunSql} and exists (
      select 1 from site_crawl_tasks t
      where t.crawl_id = c.id and t.workspace_id = c.workspace_id
        and t.task_kind = 'change_intel'))`,
    )
    .where(
      sql<boolean>`(
      exists (
        select 1 from site_page_analyses p
        join monitored_site_urls m on m.site_url_id = p.site_url_id
          and m.workspace_id = p.workspace_id and m.project_id = p.project_id and m.active
        where p.crawl_id = c.id and p.workspace_id = c.workspace_id and p.status = 'completed')
      or exists (
        select 1 from (
          select distinct on (t.site_url_id) t.classification_expected
          from site_crawl_tasks t
          join monitored_site_urls m on m.site_url_id = t.site_url_id
            and m.workspace_id = t.workspace_id and m.project_id = c.project_id and m.active
          where t.crawl_id = c.id and t.workspace_id = c.workspace_id and t.task_kind = 'analyze'
          order by t.site_url_id, t.generation desc, t.id desc) latest
        where latest.classification_expected))`,
    )
    .orderBy('c.completed_at', 'desc')
    .limit(batch)
    .execute();
  return eachCrawl(pending, 'cancelled crawl publication failed', (target) =>
    db.transaction().execute(async (trx) => {
      const crawl = await lockCrawl(trx, target.workspace_id, target.id);
      if (crawl?.status !== 'cancelled') return false;
      await enqueueFinalize(trx, crawl, 'cancelled');
      return true;
    }),
  );
}
