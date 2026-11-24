import { ACTIVE_CRAWL_STATUSES } from '@citeladder/contracts/site-health';
import { notFound } from '../errors.ts';
import type { Database } from '../db/database.ts';
import { admissionRuntime, createPageRerunCrawl } from './planner.ts';
import { holdRuntime } from './plan-runtime.ts';
import { withCrawlStart } from './crawl-budgets.ts';
import { crawlRequest } from './crawl-request.ts';
import { controls, crawlError } from './planner-policy.ts';
import { monitoredQuota } from './reads/runtime.ts';
import { lockTrackedSet } from './tracked-set.ts';
import { canonicalIdentity } from './url-identity.ts';

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

async function lockControlScope(db: Database, workspaceId: string, projectId: string) {
  const project = await db
    .selectFrom('projects')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', projectId)
    .forNoKeyUpdate()
    .executeTakeFirst();
  if (!project) throw notFound('Project');
  const active = db
    .selectFrom('site_crawls')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .where('status', 'in', ACTIVE_CRAWL_STATUSES)
    .orderBy('created_at', 'desc');
  if (await active.executeTakeFirst())
    crawlError(
      'A crawl is already running for this project. Try again when it ends.',
      'crawl_already_active',
      409,
    );
  const held = await holdRuntime(db, workspaceId);
  await lockTrackedSet(db, workspaceId, projectId);
  const crawl = await active.forNoKeyUpdate().executeTakeFirst();
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

const notTracked = () =>
  crawlError(
    'This page is not in the tracked set, so it cannot be crawled on its own',
    'rerun_not_allowed',
    409,
  );

export async function trackedPage(
  db: Database,
  scope: Readonly<{ workspaceId: string; projectId: string; url: string }>,
) {
  const project = await db
    .selectFrom('projects')
    .select('website_url')
    .where('workspace_id', '=', scope.workspaceId)
    .where('id', '=', scope.projectId)
    .executeTakeFirst();
  if (!project) throw notFound('Project');
  let hash: string;
  try {
    hash = canonicalIdentity(scope.url, project.website_url || undefined).hash;
  } catch {
    return notTracked();
  }
  const page = await db
    .selectFrom('site_urls as u')
    .innerJoin('monitored_site_urls as m', (join) =>
      join
        .onRef('m.site_url_id', '=', 'u.id')
        .onRef('m.workspace_id', '=', 'u.workspace_id')
        .onRef('m.project_id', '=', 'u.project_id'),
    )
    .select(['u.id', 'u.normalized_url'])
    .where('u.workspace_id', '=', scope.workspaceId)
    .where('u.project_id', '=', scope.projectId)
    .where('u.url_hash', '=', hash)
    .where('m.active', '=', true)
    .executeTakeFirst();
  return page ?? notTracked();
}

export async function rerunPage(
  db: Database,
  workspaceId: string,
  projectId: string,
  siteUrlId: string,
) {
  const crawl = await rerunTrackedPages(db, workspaceId, projectId, (tracked) =>
    tracked.includes(siteUrlId) ? [siteUrlId] : notTracked(),
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

export async function rerunTrackedPages(
  db: Database,
  workspaceId: string,
  projectId: string,
  pick: (tracked: readonly string[]) => readonly string[],
) {
  const scope = await lockControlScope(db, workspaceId, projectId);
  if (scope.crawl)
    crawlError(
      'A crawl is already running for this project. Try again when it ends.',
      'crawl_already_active',
      409,
    );
  const members = await db
    .selectFrom('monitored_site_urls')
    .select('site_url_id')
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .where('active', '=', true)
    .execute();
  const chosen = new Set(pick(members.map((row) => row.site_url_id)));
  if (scope.runtime.monitored_url_limit <= 0 && scope.runtime.sample_url_limit <= 0)
    crawlError(
      'The current monitored-URL allowance does not allow analysis of this URL',
      'monitoring_not_allowed',
      403,
    );
  const urls = chosen.size
    ? await db
        .selectFrom('site_urls')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('project_id', '=', projectId)
        .where('id', 'in', [...chosen])
        .orderBy('normalized_url')
        .orderBy('id')
        .execute()
    : [];
  const [first, ...rest] = urls;
  if (!first || urls.length !== chosen.size)
    crawlError('Site URL not found in this project', 'invalid_selection');
  const { robots, robotsDecision } = controls(await crawlRequest(db, workspaceId, projectId));
  return withCrawlStart(db, { workspaceId, kind: 'page' }, () =>
    createPageRerunCrawl(
      db,
      workspaceId,
      projectId,
      scope.profile,
      [first, ...rest],
      scope.runtime,
      { robots, robotsDecision },
    ),
  );
}
