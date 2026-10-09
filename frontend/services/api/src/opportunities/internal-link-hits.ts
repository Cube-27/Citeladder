import { internalLinkAnalysisSchema } from '@citeladder/contracts/site-health';

import { policy } from '../config.ts';
import type { DetectorHit } from '../analysis/opportunities/evidence.ts';
import type { Database } from '../db/database.ts';
import type { Scope } from './sources.ts';

/** The crawl's newest finished internal-link run with a result, if any. */
export async function internalLinkRunId(db: Database, scope: Scope, crawlId: string) {
  const run = await db
    .selectFrom('site_internal_link_runs')
    .select('id')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('crawl_id', '=', crawlId)
    .where('state', 'in', ['completed', 'partial'])
    .where('result', 'is not', null)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return run?.id ?? null;
}

/** One page Action per source page, holding every suggested link from it. */
export async function internalLinkHits(
  db: Database,
  scope: Scope,
  runId: string | null,
): Promise<DetectorHit[]> {
  if (runId === null) return [];
  const run = await db
    .selectFrom('site_internal_link_runs')
    .select(['id', 'result'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('id', '=', runId)
    .executeTakeFirstOrThrow();
  const result = internalLinkAnalysisSchema.parse(run.result);
  type Link = (typeof result.recommendations)[number];
  const sources = new Map<string, [Link, ...Link[]]>();
  for (const link of result.recommendations) {
    const links = sources.get(link.source.site_url_id);
    if (links) links.push(link);
    else sources.set(link.source.site_url_id, [link]);
  }
  return [...sources].map(([id, links]) => {
    const source = links[0].source;
    return {
      rule_id: 'site_contextual_links',
      target_key: `internal-links:${id}`,
      target_prompt_id: null,
      target_url: source.url,
      target_theme: null,
      evidence: {
        site_url_id: id,
        crawl_id: result.crawl_id,
        internal_link_run_id: run.id,
        recommendations: links,
        content_handoff: { source_url: source.url, recommendations: links },
      },
      source_analysis_ids: [
        ...new Set(links.flatMap((link) => [link.source.analysis_id, link.target.analysis_id])),
      ],
      source_issue_ids: [],
      source_metric_ids: [run.id],
      value_factor: policy.opportunity.opportunities.SITE_VALUE_FACTOR,
      gap_factor: policy.opportunity.opportunities.SITE_GAP_FACTOR,
    };
  });
}
