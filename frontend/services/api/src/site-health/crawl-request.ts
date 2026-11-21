import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import {
  robotsDecisionSchema,
  type CrawlAdmission,
  type RobotsDecision,
} from './planner-policy.ts';
import { dashboardCrawl } from './reads/crawl.ts';

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
  const latest = await dashboardCrawl(db, workspaceId, projectId, null);
  const frozen = record(latest?.configuration);
  if (frozen.robots !== 'ignore') return { project_id: projectId, robots: 'respect' };
  return {
    project_id: projectId,
    robots: 'ignore',
    robots_decision: robotsDecisionSchema.parse(frozen.robots_decision),
  };
}
