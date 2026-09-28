import { isDeepStrictEqual } from 'node:util';
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { parseUuid } from '../http/uuid.ts';
import { record } from '../db/json.ts';
import {
  evaluation,
  evaluatePlacementCheck,
  evaluateTrafficMetric,
  evaluateVisibilityMetric,
  type Evaluation,
} from './verification-decisions.ts';
import type { Declaration } from './verification-result.ts';
import { scalarText } from '../text-order.ts';
export type Source = { kind: string; id: string; observed_at: string };
type Context = {
  db: Database;
  scope: WorkspaceScope;
  declaration: Declaration;
  result: Evaluation;
};
const checksOf = (d: Declaration) =>
  Array.isArray(d.expected_checks) ? d.expected_checks.map(record) : [];
const kindName = (check: Record<string, unknown>) =>
  check.kind === null || check.kind === undefined ? 'unknown' : scalarText(check.kind);
async function siteCheck(ctx: Context, crawlId: string, check: Record<string, unknown>) {
  const kind = kindName(check);
  const d = ctx.declaration;
  if (!['site_rule', 'page_fact'].includes(kind)) {
    ctx.result.limitations.push(`${kind}: unavailable from a site crawl`);
    return;
  }
  const targets = Array.isArray(d.target_site_url_ids) ? d.target_site_url_ids : [];
  const target = parseUuid(check.target_site_url_id ?? (targets.length === 1 ? targets[0] : null));
  if (!target) {
    ctx.result.limitations.push(`${kind}: no resolved target`);
    return;
  }
  const analysis = await ctx.scope
    .selectFrom(ctx.db, 'site_page_analyses')
    .innerJoin('site_fetch_artifacts', 'site_fetch_artifacts.id', 'site_page_analyses.artifact_id')
    .selectAll('site_page_analyses')
    .select('site_fetch_artifacts.normalized_facts')
    .where('site_fetch_artifacts.workspace_id', '=', d.workspace_id)
    .where('site_page_analyses.project_id', '=', d.project_id)
    .where('site_page_analyses.crawl_id', '=', crawlId)
    .where('site_page_analyses.site_url_id', '=', target)
    .where('site_page_analyses.is_current', '=', true)
    .where('site_page_analyses.finalized_at', 'is not', null)
    .where(
      'site_fetch_artifacts.fetched_at',
      '>',
      sql<Date>`${d.declared_implemented_at}::timestamptz`,
    )
    .orderBy('site_page_analyses.created_at', 'desc')
    .orderBy('site_page_analyses.id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!analysis) {
    ctx.result.limitations.push(`${kind}: target was not analyzed`);
    return;
  }
  let matched: boolean;
  if (kind === 'site_rule') {
    const ids = Array.isArray(analysis.source_evaluation_ids)
      ? analysis.source_evaluation_ids.map(String)
      : [];
    const rule = ids.length
      ? await ctx.scope
          .selectFrom(ctx.db, 'site_rule_evaluations')
          .selectAll()
          .where('id', 'in', ids)
          .where('rule_id', '=', String(check.rule_id ?? ''))
          .executeTakeFirst()
      : undefined;
    if (!rule || !['satisfied', 'missing', 'partial'].includes(rule.outcome)) {
      ctx.result.limitations.push('site_rule: no applicable evaluation');
      return;
    }
    ctx.result.rule_evaluation_ids.add(rule.id);
    const expected =
      check.expected_outcome === 'pass'
        ? 'satisfied'
        : check.expected_outcome === 'fail'
          ? 'missing'
          : check.expected_outcome;
    matched = rule.outcome === expected;
  } else {
    const facts = record(analysis.normalized_facts);
    const key = String(check.fact_key || '');
    if (!Object.hasOwn(facts, key)) {
      ctx.result.limitations.push(`page_fact: ${key} unavailable`);
      return;
    }
    matched = isDeepStrictEqual(facts[key], check.expected_value ?? null);
  }
  ctx.result.observed++;
  ctx.result.analysis_ids.add(analysis.id);
  if (matched) ctx.result.matched++;
  else ctx.result.contradicted = true;
}
async function auditEvidence(ctx: Context, id: string) {
  const d = ctx.declaration;
  const snapshot = await ctx.scope
    .selectFrom(ctx.db, 'metric_snapshots')
    .selectAll()
    .where('project_id', '=', d.project_id)
    .where('audit_id', '=', id)
    .where('created_at', '>', sql<Date>`${d.declared_implemented_at}::timestamptz`)
    .executeTakeFirst();
  for (const check of checksOf(d)) {
    if (check.kind !== 'visibility_metric') {
      ctx.result.limitations.push(`${kindName(check)}: unavailable from an AI audit`);
      continue;
    }
    const prompt = parseUuid(check.target_prompt_id);
    const row = prompt
      ? await ctx.scope
          .selectFrom(ctx.db, 'audits')
          .innerJoin('audit_prompt_snapshots', 'audit_prompt_snapshots.audit_id', 'audits.id')
          .select('prompt_index')
          .where('audits.id', '=', id)
          .where('prompt_id', '=', prompt)
          .executeTakeFirst()
      : undefined;
    const index = row?.prompt_index ?? null;
    if (check.target_prompt_id !== undefined && check.target_prompt_id !== null && index === null) {
      ctx.result.limitations.push('visibility_metric: target prompt unavailable');
      continue;
    }
    evaluateVisibilityMetric(snapshot, check, index, ctx.result);
  }
}
async function trafficEvidence(ctx: Context, id: string) {
  const d = ctx.declaration;
  const snapshot = await ctx.scope
    .selectFrom(ctx.db, 'traffic_snapshots')
    .selectAll()
    .where('project_id', '=', d.project_id)
    .where('id', '=', id)
    .where('created_at', '>', sql<Date>`${d.declared_implemented_at}::timestamptz`)
    .executeTakeFirst();
  for (const check of checksOf(d)) {
    if (check.kind !== 'traffic_metric')
      ctx.result.limitations.push(`${kindName(check)}: unavailable from a traffic snapshot`);
    else evaluateTrafficMetric(snapshot, check, ctx.result);
  }
}
async function placementEvidence(ctx: Context) {
  const kinds = checksOf(ctx.declaration).map(kindName);
  const kind = policy.opportunity.placement.PLACEMENT_CHECK_KIND;
  for (const item of kinds)
    if (item !== kind) ctx.result.limitations.push(`${item}: unavailable from a page inspection`);
  if (!kinds.includes(kind)) return;
  const check = await ctx.scope
    .selectFrom(ctx.db, 'placement_checks')
    .selectAll()
    .where('implementation_event_id', '=', ctx.declaration.id)
    .executeTakeFirst();
  evaluatePlacementCheck(check, ctx.result);
}
export async function evidenceFor(
  db: Database,
  declaration: Declaration,
  source: Source,
): Promise<Evaluation> {
  const ctx = {
    db,
    declaration,
    scope: new WorkspaceScope(declaration.workspace_id),
    result: evaluation(),
  };
  if (source.kind === 'site_crawl')
    for (const check of checksOf(declaration)) await siteCheck(ctx, source.id, check);
  else if (source.kind === 'audit') await auditEvidence(ctx, source.id);
  else if (source.kind === 'source_page_inspection') await placementEvidence(ctx);
  else await trafficEvidence(ctx, source.id);
  return ctx.result;
}
