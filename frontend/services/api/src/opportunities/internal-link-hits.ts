import { internalLinkAnalysisSchema } from '@citeladder/contracts/site-health';

import { policy } from '../config.ts';
import type { DetectorHit } from '../analysis/opportunities/evidence.ts';
import type { Database } from '../db/database.ts';
import type { Scope } from './sources.ts';

/** One page Action per source page, holding every suggested link from it. */
export async function internalLinkHits(
  db: Database,
  scope: Scope,
  crawlId: string,
): Promise<{ runId: string | null; hits: DetectorHit[] }> {
  const run = await db
    .selectFrom('site_internal_link_runs')
    .select(['id', 'result'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('crawl_id', '=', crawlId)
    .where('state', 'in', ['completed', 'partial'])
    .where('result', 'is not', null)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  if (!run) return { runId: null, hits: [] };
  const result = internalLinkAnalysisSchema.parse(run.result);
  const sources = Map.groupBy(result.recommendations, (link) => link.source.site_url_id);
  const hits: DetectorHit[] = [...sources].map(([id, links]) => {
    const source = links[0]!.source;
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
      title_override: null,
      remediation_override: null,
    };
  });
  return { runId: run.id, hits };
}
