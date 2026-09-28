import { contentLinkSchema, contentStructureSchema } from '@citeladder/contracts/site-health';

import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { ApiError } from '../errors.ts';
import { latestContentCrawl } from '../site-health/content-runs.ts';
import type { MemberCheck } from './declaration-checks.ts';
import type { OpportunityRow } from './projection.ts';
import type { Scope } from './sources.ts';

export async function contentDeclarationChecks(
  db: Database,
  scope: Scope,
  members: OpportunityRow[],
  ids: string[],
): Promise<MemberCheck[]> {
  const selected = new Set(ids);
  if (!selected.size || selected.size !== ids.length)
    throw new ApiError(409, 'Select the links you implemented in Content structure');
  const crawl = await latestContentCrawl(db, scope);
  const checks: MemberCheck[] = [];
  for (const member of members) {
    const evidence = record(member.evidence);
    const run = await db
      .selectFrom('site_content_structure_runs')
      .select(['id', 'crawl_id', 'result'])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('id', '=', String(evidence.content_structure_run_id))
      .where('state', 'in', ['completed', 'partial'])
      .executeTakeFirst();
    if (!run || run.crawl_id !== crawl?.id) continue;
    const result = contentStructureSchema.parse(run.result);
    const eligible = contentLinkSchema.array().parse(evidence.recommendations);
    for (const link of eligible) {
      if (!selected.has(link.id) || !result.recommendations.some((row) => row.id === link.id))
        continue;
      checks.push({
        member,
        check: {
          kind: 'contextual_link',
          recommendation_id: link.id,
          content_structure_run_id: run.id,
          target_site_url_id: link.source.site_url_id,
          target_url: link.target.url,
          anchor_text: link.anchor.text,
          source_analysis_id: link.source.analysis_id,
          source_artifact_id: link.source.artifact_id,
          target_analysis_id: link.target.analysis_id,
          extractor_version: link.source.extractor_version,
        },
      });
    }
  }
  if (checks.length !== selected.size)
    throw new ApiError(409, 'Selected links are unavailable or belong to another Action');
  return checks;
}
