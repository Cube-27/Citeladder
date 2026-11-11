import { policy } from '../../config.ts';
import type {
  AnalysisEvidence,
  DetectorHit,
  PromptSnapshotEvidence,
  SiteEvidence,
  VisibilityEvidence,
} from './evidence.ts';
import {
  gapFactorVisibility,
  recommendationStrengthFactor,
  valueFactorForPrompt,
} from './scoring.ts';
import { summarizeSourcePattern } from './source-patterns.ts';
import { compareText } from '../../text-order.ts';
import type { NonEmpty } from '../../lists.ts';
import { targetKey } from './targets.ts';
import { issueGroupId, ruleTitle } from '../../site-health/reads/rules.ts';
const p = policy.opportunity.opportunities;
export const rules = p.OPPORTUNITY_RULES_BY_ID as Record<
  string,
  (typeof p.OPPORTUNITY_RULES_BY_ID)[keyof typeof p.OPPORTUNITY_RULES_BY_ID]
>;
const sortedUnique = (values: string[]) => [...new Set(values)].sort(compareText);
function gapHit(
  e: VisibilityEvidence,
  rule: string,
  index: number,
  rows: AnalysisEvidence[],
  snapshot: PromptSnapshotEvidence | undefined,
  competitors: string[],
): DetectorHit {
  const [value, source, key] = valueFactorForPrompt(
    snapshot?.buyer_stage ?? '',
    snapshot?.prompt_intent ?? '',
    snapshot?.intent ?? '',
  );
  const strength = recommendationStrengthFactor(
    rows.flatMap((a) => a.entity_assessments).filter((a) => a.entity_kind === 'competitor'),
  );
  const engines = sortedUnique(rows.map((a) => a.logical_engine).filter(Boolean));
  return {
    rule_id: rule,
    target:
      snapshot?.prompt_id != null
        ? { kind: 'prompt', prompt_id: snapshot.prompt_id, theme: snapshot.theme || null }
        : {
            kind: 'prompt_index',
            audit_id: e.audit_id,
            prompt_index: index,
            theme: snapshot?.theme || null,
          },
    evidence: {
      prompt_text: snapshot?.text ?? '',
      prompt_intent: snapshot?.intent ?? '',
      buyer_stage: snapshot?.buyer_stage ?? '',
      new_prompt_intent: snapshot?.prompt_intent ?? '',
      prompt_theme: snapshot?.theme ?? '',
      prompt_index: index,
      repetitions: rows.length,
      observed_engines: engines,
      brand_mentioned: rows.some((a) => a.brand_mentioned),
      owned_citation_count: 0,
      source_pattern: summarizeSourcePattern(rows.flatMap((a) => a.citations)),
      ...(rule === 'brand_absent_high_value_prompt'
        ? { competitor_names: competitors, engines }
        : { owned_domains: [...e.owned_domains].sort(compareText) }),
      audit_id: e.audit_id,
      priority_factors: {
        value_factor: value,
        value_source: source,
        value_key: key,
        recommendation_strength_factor: strength,
      },
    },
    source_analysis_ids: rows.map((a) => a.analysis_id).sort(compareText),
    source_issue_ids: [],
    source_metric_ids: [],
    value_factor: value,
    gap_factor: gapFactorVisibility(competitors.length, 0, strength),
  };
}
function visibilityGaps(e: VisibilityEvidence, rule: string, absent: boolean): DetectorHit[] {
  if (!rules[rule]!.enabled || (!absent && !e.owned_domains.length)) return [];
  const snapshots = new Map(e.prompt_snapshots.map((s) => [s.prompt_index, s]));
  const groups = new Map<number, AnalysisEvidence[]>();
  for (const row of e.analyses) {
    const group = groups.get(row.prompt_index) ?? [];
    group.push(row);
    groups.set(row.prompt_index, group);
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .flatMap(([index, rows]) => {
      const competitors = sortedUnique(rows.flatMap((a) => a.competitor_names).filter(Boolean));
      if (
        rows.some((a) => a.owned_citation_count > 0) ||
        (absent && (rows.some((a) => a.brand_mentioned) || !competitors.length))
      )
        return [];
      return [gapHit(e, rule, index, rows, snapshots.get(index), competitors)];
    });
}
export const detectBrandAbsentHighValuePrompt = (e: VisibilityEvidence) =>
  visibilityGaps(e, 'brand_absent_high_value_prompt', true);
export const detectOwnedPageNotCited = (e: VisibilityEvidence) =>
  visibilityGaps(e, 'owned_page_not_cited', false);
type SiteIssue = SiteEvidence['issues'][number];
const family = p.SITE_ISSUE_FAMILY;
const isFamilyIssue = (issue: SiteIssue) =>
  issue.finding_class === policy.opportunity.refresh.finding_class_defect &&
  issue.rule_id.startsWith(family.ISSUE_RULE_PREFIX);

/**
 * One finding per issue-family rule across every page it fails on: its
 * cohort lists the pages in URL order, at most `COHORT_PAGES_MAX`, and cites
 * every issue. A page outside the project's URLs is not in the cohort.
 */
function issueFamilyHits(e: SiteEvidence, urls: ReadonlyMap<string, string>): DetectorHit[] {
  if (!rules[family.RULE_ID]!.enabled) return [];
  const byRule = new Map<string, NonEmpty<{ issue: SiteIssue; url: string }>>();
  for (const issue of e.issues.filter(isFamilyIssue)) {
    const url = urls.get(issue.site_url_id);
    if (url === undefined) continue;
    const found = byRule.get(issue.rule_id);
    if (found) found.push({ issue, url });
    else byRule.set(issue.rule_id, [{ issue, url }]);
  }
  return [...byRule]
    .sort(([left], [right]) => compareText(left, right))
    .map(([ruleId, entries]) => {
      const issues = entries.map((entry) => entry.issue);
      const pages = [
        ...new Map(
          entries.map(({ issue, url }) => [
            issue.site_url_id,
            { site_url_id: issue.site_url_id, url },
          ]),
        ).values(),
      ].sort(
        (left, right) =>
          compareText(left.url, right.url) || compareText(left.site_url_id, right.site_url_id),
      );
      const first = entries[0].issue;
      const label = ruleTitle(ruleId);
      return {
        rule_id: family.RULE_ID,
        target: { kind: 'issue_family', rule_id: ruleId, label },
        evidence: {
          issue_rule_id: ruleId,
          issue_severity: first.severity,
          category: first.category,
          cohort: {
            rule_id: ruleId,
            rule_label: label,
            crawl_id: e.crawl_id,
            group_id: issueGroupId(e.crawl_id, ruleId, first.finding_class),
            page_count: pages.length,
            pages: pages.slice(0, family.COHORT_PAGES_MAX),
          },
          coverage: e.coverage,
          limitations: [...e.limitations],
        },
        source_analysis_ids: [],
        source_issue_ids: sortedUnique(issues.map((issue) => issue.issue_id)),
        source_metric_ids: [],
        value_factor: p.SITE_VALUE_FACTOR,
        gap_factor: p.SITE_GAP_FACTOR,
        finding: { severity: first.severity, title: label },
      };
    });
}

export function detectSiteIssueOpportunities(e: SiteEvidence): DetectorHit[] {
  const urls = new Map(e.urls.map((u) => [u.site_url_id, u.normalized_url]));
  const mapping: Record<string, string> = p.SITE_ISSUE_TO_OPPORTUNITY_RULE_ID;
  // Each hit cites one issue; ties sort by that issue's id.
  const hits: { issueId: string; hit: DetectorHit }[] = [];
  for (const issue of e.issues) {
    const rule = mapping[issue.rule_id];
    const url = urls.get(issue.site_url_id);
    if (
      issue.finding_class !== policy.opportunity.refresh.finding_class_defect ||
      !rule ||
      !rules[rule]!.enabled ||
      !url
    )
      continue;
    hits.push({
      issueId: issue.issue_id,
      hit: {
        rule_id: rule,
        target: { kind: 'site_page', url },
        evidence: {
          issue_rule_id: issue.rule_id,
          issue_severity: issue.severity,
          category: issue.category,
          issue_evidence: issue.evidence ?? {},
          crawl_id: e.crawl_id,
          site_url_id: issue.site_url_id,
          url,
          coverage: e.coverage,
          limitations: [...e.limitations],
        },
        source_analysis_ids: [],
        source_issue_ids: [issue.issue_id],
        source_metric_ids: [],
        value_factor: p.SITE_VALUE_FACTOR,
        gap_factor: p.SITE_GAP_FACTOR,
      },
    });
  }
  return [
    ...hits
      .toSorted(
        (a, b) =>
          compareText(a.hit.rule_id, b.hit.rule_id) ||
          compareText(targetKey(a.hit.target), targetKey(b.hit.target)) ||
          compareText(a.issueId, b.issueId),
      )
      .map(({ hit }) => hit),
    ...issueFamilyHits(e, urls),
  ];
}
