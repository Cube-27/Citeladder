/**
 * The `analyze` task: acquire one monitored page (or reuse its discover
 * artifact), extract and analyze it, and commit the evidence together with the
 * task's own outcome. Network I/O happens outside any transaction; the commit
 * re-checks lease, crawl, membership and entitlement under the Site Health
 * lock order (runtime, membership, crawl, task) so a cancelled or lost task
 * writes nothing.
 */
import { randomUUID } from 'node:crypto';

import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import type { SiteTask } from '../queue/task-queue.ts';
import { enqueueCatalogProjection } from '../commerce/projection.ts';
import { extractPageFacts } from './analysis/facts.ts';
import type { Facts } from './analysis/read-facts.ts';
import {
  writeArtifact,
  writeAttempts,
  writePageAnalysis,
  type AttemptOutcome,
} from './analysis-rows.ts';
import { isBotBlock, type SitePageFetcher } from './page-fetch.ts';
import type { Crawl } from './task-fence.ts';
import { canonicalIdentity } from './url-identity.ts';

const statuses = policy.task_queue.statuses;
const codes = policy.site_health.page_analysis.acquisition.error_codes;
const BODYLESS = new Set(policy.site_health.page_analysis.acquisition.bodyless_status_codes);
const COUNT_BEARING = new Set<string>(policy.site_health.reads.event_count_bearing_keys);
const ACTIVE_CRAWL = new Set(['draft', 'validating', 'queued', 'running', 'paused']);
const ACTIVE_TASK = [statuses.queued, statuses.leased, statuses.running, statuses.retry_wait];
const SAMPLE_SOURCES = new Set(['free_sample', 'bootstrap']);

export function analyzeSettings(env: Record<string, string | undefined> = process.env) {
  const spec = policy.site_health.settings;
  const number = (name: keyof typeof spec) => Number(resolveSettingSpec(spec[name], env));
  return {
    dependencyRetry: number('analysis_dependency_retry_seconds'),
    dependencyRetryMax: number('analysis_dependency_retry_max_seconds'),
    dependencyMaxWait: number('analysis_dependency_max_wait_seconds'),
    retryBase: number('retry_base_delay_seconds'),
    retryMax: number('retry_max_delay_seconds'),
    retryJitter: number('retry_jitter_seconds'),
  };
}
type Settings = ReturnType<typeof analyzeSettings>;
export type AnalyzeContext = {
  db: Database;
  owner: string;
  fetcher: SitePageFetcher;
  settings: Settings;
};
type Outcome = AttemptOutcome & {
  facts: Facts | null;
  page: Parameters<typeof writeArtifact>[3] | null;
  reusedArtifactId: string | null;
  retryable: boolean;
  errorDetail: string;
};

/** Backoff for a prerequisite recheck: doubles with the wait, clamped, never past the bound. */
function dependencyDelay(settings: Settings, waited: number) {
  const base = Math.max(0, settings.dependencyRetry);
  const backoff = base
    ? Math.min(base * 2 ** Math.min(waited / base, 16), settings.dependencyRetryMax)
    : 0;
  return Math.min(backoff, Math.max(0, settings.dependencyMaxWait - waited));
}
/** Exponential retry backoff with deterministic jitter (the attempt number, not a random draw). */
const retryDelay = (settings: Settings, attempt: number) =>
  Math.min(settings.retryBase * 2 ** attempt, settings.retryMax) +
  ((attempt * 0.37) % 1) * settings.retryJitter;

const owned = (db: Database, task: SiteTask, owner: string) =>
  db
    .updateTable('site_crawl_tasks')
    .where('id', '=', task.id)
    .where('workspace_id', '=', task.workspace_id)
    .where('lease_owner', '=', owner);

async function cancel(db: Database, task: SiteTask) {
  const now = new Date();
  await db
    .updateTable('site_crawl_tasks')
    .set({
      status: statuses.cancelled,
      lease_owner: null,
      lease_expires_at: null,
      completed_at: now,
      updated_at: now,
      error_code: 'cancelled',
    })
    .where('id', '=', task.id)
    .where('workspace_id', '=', task.workspace_id)
    .where('status', 'not in', [statuses.succeeded, statuses.failed, statuses.cancelled])
    .execute();
}

async function loadScope(db: Database, claimed: SiteTask) {
  const task = await db
    .selectFrom('site_crawl_tasks')
    .selectAll()
    .where('id', '=', claimed.id)
    .where('crawl_id', '=', claimed.crawl_id)
    .where('workspace_id', '=', claimed.workspace_id)
    .executeTakeFirst();
  const crawl = await db
    .selectFrom('site_crawls')
    .selectAll()
    .where('id', '=', claimed.crawl_id)
    .where('workspace_id', '=', claimed.workspace_id)
    .executeTakeFirst();
  return task && crawl ? { task, crawl } : null;
}

/** The first task to run moves a queued (or resumed) crawl to running. */
async function startCrawl(db: Database, crawl: Crawl) {
  if (crawl.status === 'running' || !['queued', 'paused'].includes(crawl.status)) return;
  const now = new Date();
  await db
    .updateTable('site_crawls')
    .set((eb) => ({
      status: 'running',
      started_at: eb.fn.coalesce('started_at', eb.val(now)),
      updated_at: now,
    }))
    .where('id', '=', crawl.id)
    .where('workspace_id', '=', crawl.workspace_id)
    .where('status', 'in', ['queued', 'paused'])
    .execute();
}

type GuardRows = {
  monitored: { active: boolean; selection_source: string } | undefined;
  runtime: { monitored_url_limit: number } | undefined;
};
async function guardRows(
  db: Database,
  crawl: Crawl,
  task: SiteTask,
  lock: boolean,
): Promise<GuardRows> {
  const runtimeQuery = db
    .selectFrom('workspace_site_health_runtime')
    .select('monitored_url_limit')
    .where('workspace_id', '=', crawl.workspace_id);
  const runtime = await (lock ? runtimeQuery.forUpdate() : runtimeQuery).executeTakeFirst();
  const monitoredQuery = db
    .selectFrom('monitored_site_urls')
    .select(['active', 'selection_source'])
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('site_url_id', '=', task.site_url_id ?? '00000000-0000-0000-0000-000000000000');
  const monitored = await (lock ? monitoredQuery.forUpdate() : monitoredQuery).executeTakeFirst();
  return { runtime, monitored };
}
/** Live crawl, active membership, and an entitlement that still allows this row's analysis. */
function guardAllows(crawl: Crawl, rows: GuardRows) {
  if (!ACTIVE_CRAWL.has(crawl.status) || !rows.monitored?.active || !rows.runtime) return false;
  return (
    rows.runtime.monitored_url_limit > 0 || SAMPLE_SOURCES.has(rows.monitored.selection_source)
  );
}

/** A discover artifact of this URL to reuse, or whether its discover task is still in flight. */
async function reusableArtifact(db: Database, crawl: Crawl, task: SiteTask) {
  const artifact = await db
    .selectFrom('site_fetch_artifacts as f')
    .innerJoin('site_crawl_tasks as t', (join) =>
      join.onRef('t.id', '=', 'f.task_id').onRef('t.workspace_id', '=', 'f.workspace_id'),
    )
    .select(['f.id', 'f.normalized_facts'])
    .where('f.workspace_id', '=', crawl.workspace_id)
    .where('f.crawl_id', '=', crawl.id)
    .where('f.fetch_purpose', '=', 'discover')
    .where(
      'f.extractor_version',
      '=',
      crawl.extractor_version || policy.site_health.versions.extractor,
    )
    .where('f.normalized_facts', 'is not', null)
    .where('t.url_hash', '=', task.url_hash)
    .orderBy('f.fetched_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (artifact)
    return {
      artifact: { id: artifact.id, facts: record(artifact.normalized_facts) },
      pending: false,
    };
  return { artifact: null, pending: await activeTask(db, crawl, task.url_hash, 'discover') };
}
async function activeTask(db: Database, crawl: Crawl, urlHash: string, kind: string) {
  const row = await db
    .selectFrom('site_crawl_tasks')
    .select('id')
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('task_kind', '=', kind)
    .where('url_hash', '=', urlHash)
    .where('status', 'in', ACTIVE_TASK)
    .limit(1)
    .executeTakeFirst();
  return Boolean(row);
}
/** The root's analysis waits for the site-level setup evidence it reads. */
async function setupPending(db: Database, crawl: Crawl, task: SiteTask) {
  if (crawl.site_facts !== null) return false;
  let rootHash = '';
  try {
    rootHash = canonicalIdentity(crawl.root_url).hash;
  } catch {
    return false;
  }
  if (task.url_hash !== rootHash) return false;
  const row = await db
    .selectFrom('site_crawl_tasks')
    .select('id')
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('task_kind', '=', 'site_setup')
    .where('status', 'in', ACTIVE_TASK)
    .limit(1)
    .executeTakeFirst();
  return Boolean(row);
}

async function markRunning(db: Database, task: SiteTask, owner: string) {
  const result = await owned(db, task, owner)
    .set({ status: statuses.running, heartbeat_at: new Date(), updated_at: new Date() })
    .where('status', '=', statuses.leased)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}
/** Commit the supported-HTML classification cohort before parsing. */
const expectClassification = (db: Database, task: SiteTask, owner: string) =>
  owned(db, task, owner).set({ classification_expected: true, updated_at: new Date() }).execute();

/** Classify a returned HTTP status: a 4xx is terminal except 429; every 5xx is retryable. */
function httpError(status: number): [string, boolean] | null {
  if (status >= 400 && status < 500) return [codes.http_4xx, status === 429];
  return status >= 500 ? [codes.http_5xx, true] : null;
}

async function acquire(ctx: AnalyzeContext, task: SiteTask): Promise<Outcome> {
  const fetched = await ctx.fetcher.fetch(task.requested_url);
  const base = { facts: null, page: null, reusedArtifactId: null };
  if (!fetched.ok)
    return {
      ...base,
      succeeded: false,
      errorCode: fetched.code,
      errorDetail: fetched.detail,
      retryable: fetched.retryable,
      statusCode: null,
      latencyMs: fetched.latencyMs,
      calls: fetched.calls,
    };
  const { page } = fetched;
  const failure = isBotBlock(page) ? ([codes.bot_blocked, false] as const) : httpError(page.status);
  const common = {
    statusCode: page.status,
    latencyMs: fetched.latencyMs,
    calls: fetched.calls,
    page,
  };
  if (failure)
    return {
      ...base,
      ...common,
      succeeded: false,
      errorCode: failure[0],
      errorDetail: '',
      retryable: failure[1],
    };
  if (!BODYLESS.has(page.status)) await expectClassification(ctx.db, task, ctx.owner);
  const facts = extractPageFacts(page.body, {
    finalUrl: page.url,
    contentType: page.contentType,
    charset: page.charset,
    statusCode: page.status,
    headers: page.headers,
    httpVersion: page.httpVersion,
    ttfbMs: page.ttfbMs,
    latencyMs: fetched.latencyMs,
    wireBytes: page.wireBytes,
    decodedBytes: page.body.length,
  });
  return {
    ...base,
    ...common,
    facts,
    succeeded: true,
    errorCode: '',
    errorDetail: '',
    retryable: false,
  };
}

/** Lock in Site Health order and re-check; null when this worker no longer owns the task. */
async function lockForCommit(trx: Database, claimed: SiteTask, owner: string) {
  const scope = await loadScope(trx, claimed);
  if (!scope) return null;
  const rows = await guardRows(trx, scope.crawl, scope.task, true);
  const crawl = await trx
    .selectFrom('site_crawls')
    .selectAll()
    .where('id', '=', claimed.crawl_id)
    .where('workspace_id', '=', claimed.workspace_id)
    .forNoKeyUpdate()
    .executeTakeFirst();
  const task = await trx
    .selectFrom('site_crawl_tasks')
    .selectAll()
    .where('id', '=', claimed.id)
    .where('workspace_id', '=', claimed.workspace_id)
    .where('lease_owner', '=', owner)
    .where('status', '=', statuses.running)
    .forUpdate()
    .executeTakeFirst();
  if (!crawl || !task) return null;
  return { crawl, task, allowed: guardAllows(crawl, rows) };
}

async function recordProgress(trx: Database, crawl: Crawl) {
  const now = new Date();
  const analyzed = crawl.analyzed_url_count + 1;
  await trx
    .updateTable('site_crawls')
    .set({ analyzed_url_count: analyzed, updated_at: now })
    .where('id', '=', crawl.id)
    .where('workspace_id', '=', crawl.workspace_id)
    .execute();
  const disclose = record(crawl.configuration).count_disclosure === true;
  const payload = Object.fromEntries(
    Object.entries({ analyzed }).filter(([key]) => disclose || !COUNT_BEARING.has(key)),
  );
  await trx
    .insertInto('site_crawl_events')
    .values({
      id: randomUUID(),
      crawl_id: crawl.id,
      event_type: 'analysis.progress',
      message: 'analysis progress',
      payload: JSON.stringify(payload),
      created_at: now,
    })
    .execute();
}

/** Stage the evidence and settle the task in one transaction. */
async function persist(ctx: AnalyzeContext, claimed: SiteTask, outcome: Outcome) {
  await ctx.db.transaction().execute(async (trx) => {
    const locked = await lockForCommit(trx, claimed, ctx.owner);
    if (!locked) return;
    const { crawl, task } = locked;
    if (!locked.allowed) {
      await cancel(trx, task);
      return;
    }
    let artifactId = outcome.reusedArtifactId;
    if (outcome.facts && task.site_url_id) {
      artifactId ??= await writeArtifact(
        trx,
        crawl,
        task,
        outcome.page!,
        outcome.facts,
        ctx.fetcher.settings.policyVersion,
        outcome.latencyMs ?? 0,
      );
      const analysis = await writePageAnalysis(
        trx,
        crawl,
        { ...task, site_url_id: task.site_url_id },
        artifactId,
        outcome.facts,
      );
      if (analysis.pageKind === 'category' || analysis.pageKind === 'product')
        await enqueueCatalogProjection(
          trx,
          { workspaceId: crawl.workspace_id, projectId: crawl.project_id },
          analysis.id,
        );
    } else artifactId = null;
    if (!outcome.reusedArtifactId)
      await writeAttempts(
        trx,
        crawl,
        task,
        outcome,
        artifactId,
        ctx.fetcher.settings.policyVersion,
      );
    const now = new Date();
    const attempt = task.attempt_count + 1;
    if (artifactId) {
      await recordProgress(trx, crawl);
      await owned(trx, task, ctx.owner)
        .set({
          status: statuses.succeeded,
          attempt_count: attempt,
          result_artifact_id: artifactId,
          completed_at: now,
          updated_at: now,
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
          error_code: '',
          error_detail: '',
        })
        .execute();
      return;
    }
    const retry = outcome.retryable && attempt < task.max_attempts;
    await owned(trx, task, ctx.owner)
      .set({
        status: retry ? statuses.retry_wait : statuses.failed,
        attempt_count: attempt,
        available_at: new Date(
          now.getTime() + (retry ? retryDelay(ctx.settings, attempt) * 1000 : 0),
        ),
        completed_at: retry ? null : now,
        updated_at: now,
        lease_owner: null,
        lease_expires_at: null,
        heartbeat_at: null,
        error_code: outcome.errorCode.slice(0, 32),
        error_detail: outcome.errorDetail.slice(0, 2000),
      })
      .execute();
  });
}

/** Reused evidence or a fresh acquisition; null when the task should not run now. */
async function prepare(
  ctx: AnalyzeContext,
  claimed: SiteTask,
): Promise<Outcome | 'deferred' | null> {
  const scope = await loadScope(ctx.db, claimed);
  if (!scope || !ACTIVE_CRAWL.has(scope.crawl.status)) {
    await cancel(ctx.db, claimed);
    return null;
  }
  const { crawl, task } = scope;
  if (task.lease_owner !== ctx.owner) return null;
  if (!guardAllows(crawl, await guardRows(ctx.db, crawl, task, false))) {
    await cancel(ctx.db, task);
    return null;
  }
  await startCrawl(ctx.db, crawl);
  const { artifact, pending } = await reusableArtifact(ctx.db, crawl, task);
  const waited = Math.max(0, (Date.now() - new Date(task.created_at).getTime()) / 1000);
  if (
    (pending || (await setupPending(ctx.db, crawl, task))) &&
    waited < ctx.settings.dependencyMaxWait
  ) {
    // Waiting costs no attempt; past the bound this analyze acquires the page itself.
    await owned(ctx.db, task, ctx.owner)
      .set({
        status: statuses.queued,
        lease_owner: null,
        lease_expires_at: null,
        available_at: new Date(Date.now() + dependencyDelay(ctx.settings, waited) * 1000),
        error_code: '',
        error_detail: '',
        updated_at: new Date(),
      })
      .execute();
    return 'deferred';
  }
  if (!(await markRunning(ctx.db, task, ctx.owner))) return null;
  if (!artifact) return acquire(ctx, task);
  if (artifact.facts.has_html) await expectClassification(ctx.db, task, ctx.owner);
  return {
    facts: artifact.facts,
    page: null,
    reusedArtifactId: artifact.id,
    succeeded: true,
    errorCode: '',
    errorDetail: '',
    retryable: false,
    statusCode: null,
    latencyMs: null,
    calls: [],
  };
}

export async function runAnalyze(ctx: AnalyzeContext, claimed: SiteTask) {
  const outcome = await prepare(ctx, claimed);
  if (outcome && outcome !== 'deferred') await persist(ctx, claimed, outcome);
}
