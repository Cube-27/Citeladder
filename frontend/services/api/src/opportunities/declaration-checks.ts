/** Freeze server-owned expectations from the live findings and their snapshot. */
import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { record } from '../db/json.ts';
import { scalarText } from '../text-order.ts';
import type { OpportunityRow } from './projection.ts';
import type { Scope } from './sources.ts';
import { internalLinkDeclarationChecks } from './internal-link-declaration.ts';

const o = policy.opportunity.opportunities;
const p = policy.opportunity.placement;
const earned = policy.opportunity.earned_actions;
type ExpectedCheck = Record<string, unknown>;
export type MemberCheck = { check: ExpectedCheck; member: OpportunityRow };

function placementCheck(member: OpportunityRow, brandName: string): ExpectedCheck {
  const handoff = record(record(member.evidence).content_handoff);
  const entities = Array.isArray(handoff.page_entities) ? handoff.page_entities.map(record) : [];
  const brand = entities.find(
    (entity) => entity.entity_kind === policy.opportunity.source_pages.ENTITY_KIND_BRAND,
  );
  const changes: Record<string, string> = {
    [earned.RULE_EARNED_PAGE_ACQUIRE]: p.PLACEMENT_CHANGE_BRAND_LISTED,
    [earned.RULE_EARNED_PAGE_CORRECT]: p.PLACEMENT_CHANGE_DISCREPANCY_RESOLVED,
    [earned.RULE_EARNED_PAGE_DEFEND]: p.PLACEMENT_CHANGE_PLACEMENT_RESTORED,
    [earned.RULE_EARNED_PAGE_RESEARCH]: p.PLACEMENT_CHANGE_SOURCE_RESOLVED,
  };
  return {
    kind: p.PLACEMENT_CHECK_KIND,
    rule_id: member.rule_id,
    expected_change: changes[member.rule_id] ?? p.PLACEMENT_CHANGE_SOURCE_RESOLVED,
    url_hash: scalarText(handoff.url_hash),
    target_url: member.target_url,
    brand_name: brand?.entity_name || brandName,
    discrepancies: handoff.discrepancies ?? [],
    deterioration: handoff.deterioration ?? [],
    baseline_snapshot_id: handoff.snapshot_id ?? null,
  };
}

async function visibilityCheck(
  db: Database,
  scope: Scope,
  member: OpportunityRow,
  auditId: string | null,
): Promise<ExpectedCheck> {
  const check: ExpectedCheck = {
    kind: 'visibility_metric',
    metric: o.VISIBILITY_METRIC_PROJECT_SCORE,
    direction: 'increase',
    min_delta: o.VISIBILITY_CHECK_MIN_DELTA,
    tolerance: 0,
    target_prompt_id: member.target_prompt_id,
  };
  if (!auditId) return check;
  const baseline = await db
    .selectFrom('metric_snapshots')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('audit_id', '=', auditId)
    .executeTakeFirst();
  if (!baseline) return check;
  let value: unknown = baseline.visibility_score;
  if (member.target_prompt_id !== null) {
    const prompt = await db
      .selectFrom('audit_prompt_snapshots as prompt')
      .innerJoin('audits as audit', 'audit.id', 'prompt.audit_id')
      .select('prompt.prompt_index')
      .where('audit.workspace_id', '=', scope.workspaceId)
      .where('audit.project_id', '=', scope.projectId)
      .where('prompt.audit_id', '=', auditId)
      .where('prompt.prompt_id', '=', member.target_prompt_id)
      .executeTakeFirst();
    if (!prompt) return check;
    const perPrompt = record(baseline.metrics).per_prompt;
    value = Array.isArray(perPrompt)
      ? perPrompt.map(record).find((row) => row.prompt_index === prompt.prompt_index)
          ?.composite_score
      : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    check.baseline_metric_snapshot_id = baseline.id;
    check.baseline_value = value;
  }
  return check;
}

async function memberCheck(
  db: Database,
  scope: Scope,
  member: OpportunityRow,
  auditId: string | null,
  brandName: string,
): Promise<ExpectedCheck> {
  if (o.EARNED_RULE_IDS.includes(member.rule_id)) return placementCheck(member, brandName);
  const evidence = record(member.evidence);
  if (member.opportunity_type === o.OPPORTUNITY_TYPE_SITE) {
    const siteUrlId = scalarText(evidence.site_url_id);
    return {
      kind: 'site_rule',
      rule_id: scalarText(evidence.issue_rule_id) || member.rule_id,
      expected_outcome: 'pass',
      ...(siteUrlId ? { target_site_url_id: siteUrlId } : {}),
    };
  }
  if (member.opportunity_type === o.OPPORTUNITY_TYPE_TRAFFIC)
    return {
      kind: 'traffic_metric',
      metric: 'clicks',
      direction: 'increase',
      expected_value: 1,
      tolerance: 0,
    };
  return visibilityCheck(db, scope, member, auditId);
}

export async function declarationChecks(
  db: Database,
  scope: Scope,
  members: OpportunityRow[],
  auditId: string | null,
  brandName: string,
  recommendationIds: string[] = [],
): Promise<MemberCheck[]> {
  // Contextual links are declared per selected link; the page's other
  // findings keep their own checks in the same declaration.
  const contextual = members.filter((member) => member.rule_id === 'site_contextual_links');
  const checks = new Map<string, MemberCheck>();
  for (const member of members) {
    if (member.rule_id === 'site_contextual_links') continue;
    const check = await memberCheck(db, scope, member, auditId, brandName);
    const key = JSON.stringify(check);
    if (!checks.has(key)) checks.set(key, { check, member });
  }
  const links =
    contextual.length || recommendationIds.length
      ? await internalLinkDeclarationChecks(db, scope, contextual, recommendationIds)
      : [];
  return [...checks.values(), ...links];
}
