/** Append terminal revisions while retaining evaluations on their original analyses. */
import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import type { SiteRuleEvaluations } from '../generated/db-schema.ts';
import type { RuleEvaluation } from './analysis/rules.ts';
import { scoreAnalysis } from './analysis/scoring.ts';
import type { Crawl } from './task-fence.ts';

export function persistedEvaluation(row: Selectable<SiteRuleEvaluations>): RuleEvaluation {
  return {
    ...row,
    evidence: record(row.evidence),
    score_roles: row.score_roles ?? [],
    description: '',
    remediation: '',
  };
}

/** Caller holds the crawl lock and owns the terminal publication transaction. */
export async function publishFinalPageAnalyses(db: Database, crawl: Crawl) {
  const initials = await db
    .selectFrom('site_page_analyses')
    .selectAll()
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('crawl_id', '=', crawl.id)
    .where('is_current', '=', true)
    .where('finalized_at', 'is', null)
    .orderBy('site_url_id')
    .orderBy('id')
    .execute();
  if (!initials.length) return;
  const ids = initials.map((row) => row.id);
  const evaluations = await db
    .selectFrom('site_rule_evaluations')
    .selectAll()
    .where('workspace_id', '=', crawl.workspace_id)
    .where('analysis_id', '=', sql<string>`any(${ids}::uuid[])`)
    .orderBy('analysis_id')
    .orderBy('rule_id')
    .execute();
  const byAnalysis = new Map<string, typeof evaluations>();
  for (const row of evaluations) {
    const group = byAnalysis.get(row.analysis_id) ?? [];
    group.push(row);
    byAnalysis.set(row.analysis_id, group);
  }
  await db
    .updateTable('site_page_analyses')
    .set({ is_current: false })
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('crawl_id', '=', crawl.id)
    .where('id', '=', sql<string>`any(${ids}::uuid[])`)
    .execute();
  const auditTime = crawl.started_at ?? crawl.created_at;
  for (const initial of initials) {
    const sources = byAnalysis.get(initial.id) ?? [];
    const scores = scoreAnalysis(sources.map(persistedEvaluation), initial.page_kind);
    const byRule = new Map(sources.map((row) => [row.rule_id, row.id]));
    await db
      .insertInto('site_page_analyses')
      .values({
        ...initial,
        ...scores,
        id: randomUUID(),
        created_at: new Date(),
        is_current: true,
        supersedes_analysis_id: initial.id,
        finalized_at: new Date(),
        scoring_version: policy.site_health.reads.scoring_version,
        source_evaluation_ids: sources.map((row) => row.id),
        source_artifact_ids: initial.source_artifact_ids?.length
          ? initial.source_artifact_ids
          : [initial.artifact_id],
        page_kind_evidence:
          initial.page_kind_evidence === null ? null : JSON.stringify(initial.page_kind_evidence),
        expected_checkpoint_profile: JSON.stringify(
          scores.expected_checkpoint_profile.map((entry) => ({
            ...entry,
            evaluation_id: byRule.get(entry.check_id),
            audit_time: auditTime ? new Date(auditTime).toISOString() : null,
          })),
        ),
        readiness_dimensions: JSON.stringify(scores.readiness_dimensions),
      })
      .execute();
  }
}
