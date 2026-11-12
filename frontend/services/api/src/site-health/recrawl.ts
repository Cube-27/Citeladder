/**
 * A recrawl reruns an earlier crawl's random seed and robots choice, so Changes
 * always has a comparable baseline. It goes through ordinary crawl admission:
 * plan grants, fetch budgets and the one-active-crawl rule are unchanged.
 */
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { isPageRerun, pageRerunSql } from './page-rerun.ts';
import {
  crawlError,
  createCrawlRequest,
  robotsDecisionSchema,
  type CrawlAdmission,
} from './planner-policy.ts';
import { loadCrawl } from './reads/crawl.ts';
import type { Crawl } from './site-task.ts';

/** The project's newest site crawl (never a one-page rerun), created before `before` when given. */
function newestSiteCrawl(db: Database, workspaceId: string, projectId: string, before?: Date) {
  let query = new WorkspaceScope(workspaceId)
    .selectFrom(db, 'site_crawls')
    .selectAll()
    .where('project_id', '=', projectId)
    .where(pageRerunSql, '=', false);
  if (before) query = query.where('created_at', '<', before);
  return query.orderBy('created_at', 'desc').orderBy('id', 'desc').executeTakeFirst();
}

/**
 * The site crawl to rerun. A one-page rerun is no site crawl, so recrawling it
 * reruns the newest site crawl before it; copying its one-page settings would
 * start a one-page crawl that Changes then compares with the full one.
 */
async function siteCrawl(db: Database, workspaceId: string, crawlId: string) {
  const crawl = await loadCrawl(db, workspaceId, crawlId);
  if (!isPageRerun(crawl)) return crawl;
  const earlier = await newestSiteCrawl(db, workspaceId, crawl.project_id, crawl.created_at);
  return earlier ?? crawlError('No site crawl to rerun yet', 'invalid_crawl_request');
}

export async function recrawlRequest(
  db: Database,
  workspaceId: string,
  crawlId: string,
): Promise<CrawlAdmission> {
  return rerunRequest(await siteCrawl(db, workspaceId, crawlId));
}

/**
 * A scheduled crawl reruns the project's newest site crawl as Recrawl does, so
 * Changes compares like with like; a project that has never crawled gets the
 * default crawl.
 */
export async function scheduledCrawlRequest(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<CrawlAdmission> {
  const latest = await newestSiteCrawl(db, workspaceId, projectId);
  return latest ? rerunRequest(latest) : { project_id: projectId };
}

/**
 * The rerun keeps the crawl's robots choice and the person who confirmed it,
 * so a recrawl or a scheduled crawl ignores robots.txt only where its source did.
 */
function rerunRequest(crawl: Crawl): CrawlAdmission {
  const frozen = jsonObject(crawl.configuration, 'site_crawls.configuration');
  const ignore = frozen.robots === 'ignore';
  const request = createCrawlRequest.parse({
    project_id: crawl.project_id,
    // The same random seed draws the same sample, so a sampled crawl compares too.
    seed: crawl.random_seed,
    robots: ignore ? 'ignore' : 'respect',
  });
  return {
    ...request,
    robots_decision: ignore ? robotsDecisionSchema.parse(frozen.robots_decision) : null,
  };
}
