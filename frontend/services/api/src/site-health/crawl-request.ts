/**
 * The one crawl action (SH-B7). Starting a crawl and a scheduled crawl admit
 * the same request: every full crawl audits the project's tracked pages, so
 * there is no earlier crawl's scope to rerun. Only the robots choice carries
 * over: a request that names none keeps the project's newest site crawl's
 * choice and who confirmed it. Admission is ordinary: plan grants, fetch
 * budgets and the one-active-crawl rule are unchanged.
 */
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { pageRerunSql } from './page-rerun.ts';
import {
  robotsDecisionSchema,
  type CrawlAdmission,
  type RobotsDecision,
} from './planner-policy.ts';

/** The project's newest site crawl, never a one-page rerun. */
function newestSiteCrawl(db: Database, workspaceId: string, projectId: string) {
  return new WorkspaceScope(workspaceId)
    .selectFrom(db, 'site_crawls')
    .select('configuration')
    .where('project_id', '=', projectId)
    .where(pageRerunSql, '=', false)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
}

/**
 * The crawl to admit for a project. `choice` is the signed-in person's robots
 * choice, with their confirmation for `ignore`; without one the crawl keeps
 * the newest site crawl's choice (`respect` before any crawl), so a scheduled
 * crawl ignores robots.txt only where a person chose to.
 */
export async function crawlRequest(
  db: Database,
  workspaceId: string,
  projectId: string,
  choice: { robots: 'respect' } | { robots: 'ignore'; decision: RobotsDecision } | null = null,
): Promise<CrawlAdmission> {
  if (choice)
    return {
      project_id: projectId,
      robots: choice.robots,
      robots_decision: choice.robots === 'ignore' ? choice.decision : null,
    };
  const latest = await newestSiteCrawl(db, workspaceId, projectId);
  const frozen = record(latest?.configuration);
  if (frozen.robots !== 'ignore') return { project_id: projectId, robots: 'respect' };
  return {
    project_id: projectId,
    robots: 'ignore',
    robots_decision: robotsDecisionSchema.parse(frozen.robots_decision),
  };
}
