/**
 * The project's monitored set and single-page re-audits. Crawls pick the set;
 * nothing edits it, and no new work enters a running crawl (SH-B4, SH-B13).
 */
import { ACTIVE_CRAWL_STATUSES } from '@citeladder/contracts/site-health';
import { notFound } from '../errors.ts';
import type { Database } from '../db/database.ts';
import { admissionRuntime, createPageRerunCrawl } from './planner.ts';
import { holdRuntime } from './plan-runtime.ts';
import { crawlError } from './planner-policy.ts';
import { monitoredQuota } from './reads/runtime.ts';
import { lockTrackedSet } from './tracked-set.ts';

/** The project's monitored set; its route authorizes the path project. */
export async function monitoredSet(db: Database, workspaceId: string, projectId: string) {
  const rows = await db
    .selectFrom('monitored_site_urls as m')
    .innerJoin('site_urls as u', (join) =>
      join
        .onRef('u.id', '=', 'm.site_url_id')
        .onRef('u.workspace_id', '=', 'm.workspace_id')
        .onRef('u.project_id', '=', 'm.project_id'),
    )
    .select([
      'm.site_url_id',
      'u.normalized_url',
      'u.display_url',
      'u.latest_title',
      'm.active',
      'm.selection_source',
      'm.selected_at',
      'm.deselected_at',
    ])
    .where('m.workspace_id', '=', workspaceId)
    .where('m.project_id', '=', projectId)
    .orderBy('u.normalized_url')
    .orderBy('u.id')
    .execute();
  return {
    project_id: projectId,
    monitored_urls: rows.map((row) => ({
      site_url_id: row.site_url_id,
      normalized_url: row.normalized_url,
      display_url: row.display_url || row.normalized_url,
      title: row.latest_title || null,
      active: row.active,
      selection_source: row.selection_source as 'bootstrap' | 'free_sample',
      selected_at: row.selected_at?.toISOString() ?? null,
      deselected_at: row.deselected_at?.toISOString() ?? null,
    })),
    quota: await monitoredQuota(db, workspaceId, new Date()),
  };
}

/**
 * Lock a project's Site Health controls in the combined lock DAG: project,
 * runtime, membership, the active crawl, profile, then the capacity and
 * account locks that resolve the runtime. Workers publish runtime, membership,
 * crawl, task and settle crawl, profile, capacity, so neither waits on a lock
 * the other holds out of order.
 */
async function lockControlScope(db: Database, workspaceId: string, projectId: string) {
  const project = await db
    .selectFrom('projects')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', projectId)
    .forUpdate()
    .executeTakeFirst();
  if (!project) throw notFound('Project');
  const held = await holdRuntime(db, workspaceId);
  await lockTrackedSet(db, workspaceId, projectId);
  const crawl = await db
    .selectFrom('site_crawls')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .where('status', 'in', ACTIVE_CRAWL_STATUSES)
    .orderBy('created_at', 'desc')
    .forUpdate()
    .executeTakeFirst();
  const profile = await db
    .selectFrom('site_health_profiles')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .forUpdate()
    .executeTakeFirst();
  if (!profile) crawlError('Site Health profile not found', 'invalid_selection');
  const runtime = await admissionRuntime(db, held);
  return { crawl, runtime, profile };
}

/**
 * Re-audit one monitored page as its own one-page crawl. A running crawl
 * refuses it (SH-B4): the person tries again when that crawl finishes, so no
 * work joins a crawl outside its fetch hold.
 */
export async function rerunPage(
  db: Database,
  workspaceId: string,
  projectId: string,
  siteUrlId: string,
) {
  const scope = await lockControlScope(db, workspaceId, projectId);
  if (scope.crawl) crawlError('Project already has an active crawl', 'crawl_already_active', 409);
  const member = await db
    .selectFrom('monitored_site_urls')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .where('site_url_id', '=', siteUrlId)
    .where('active', '=', true)
    .executeTakeFirst();
  if (!member)
    crawlError('The URL is not part of the active monitored selection', 'rerun_not_allowed', 409);
  // Every membership is system-picked, so any analysis allowance covers it.
  if (scope.runtime.monitored_url_limit <= 0 && scope.runtime.sample_url_limit <= 0)
    crawlError(
      'The current monitored-URL allowance does not allow analysis of this URL',
      'monitoring_not_allowed',
      403,
    );
  const url = await db
    .selectFrom('site_urls')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .where('id', '=', siteUrlId)
    .executeTakeFirst();
  if (!url) crawlError('Site URL not found in this project', 'invalid_selection');
  const crawl = await createPageRerunCrawl(
    db,
    workspaceId,
    projectId,
    scope.profile,
    url,
    scope.runtime,
  );
  const task = await db
    .selectFrom('site_crawl_tasks')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('crawl_id', '=', crawl.id)
    .where('site_url_id', '=', siteUrlId)
    .where('task_kind', '=', 'analyze')
    .executeTakeFirstOrThrow();
  return {
    crawl_id: crawl.id,
    site_url_id: siteUrlId,
    task_id: task.id,
    analysis_status: crawl.analysis_status,
  };
}
