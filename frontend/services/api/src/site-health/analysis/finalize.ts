/** Cross-page checks use only the persisted acquisition evidence supplied by the caller. */
import { policy } from '../../config.ts';
import type { RuleEvaluation } from './rules.ts';

const limits = policy.site_health.page_analysis.facts.limits;
const bounded = (urls: string[]) =>
  urls.slice(0, limits.evidence_urls).map((url) => url.slice(0, limits.url_chars));

export function finalizeEvaluation(
  ruleId: string,
  outcome: string,
  evidence: Record<string, unknown>,
): RuleEvaluation {
  const rule = policy.site_health.rule_catalog.find((entry) => entry.rule_id === ruleId);
  if (!rule) throw new Error(`Missing finalize rule: ${ruleId}`);
  const web = policy.site_health.page_analysis.rules.web_check_ids.includes(ruleId);
  const pillars: Record<string, string> = policy.site_health.reads.aeo_check_pillar;
  const pillar = pillars[ruleId];
  const roles = [...(web ? ['web_fundamentals'] : []), ...(pillar ? ['aeo_readiness'] : [])];
  return {
    rule_id: rule.rule_id,
    rule_version: rule.rule_version,
    dimension: rule.dimension,
    category: rule.category,
    severity: rule.severity,
    finding_class: rule.finding_class,
    scope: rule.scope,
    weight: rule.weight,
    description: rule.description,
    remediation: rule.remediation,
    outcome,
    evidence,
    display_applicability: outcome !== 'not_applicable',
    score_applicability: roles.length > 0 && outcome !== 'not_applicable',
    reason_code: String(evidence.reason ?? ''),
    score_roles: roles,
    readiness_dimension: '',
    readiness_weight: 0,
  };
}

export function entitySetEvaluation(
  ruleId: string,
  totalCount: number,
  checkedCount: number,
  failingUrls: string[],
) {
  const total = Math.max(0, totalCount);
  const checked = Math.min(total, Math.max(0, checkedCount));
  const unique = [...new Set(failingUrls)];
  const failures = Math.min(checked, unique.length);
  if (!total)
    return finalizeEvaluation(ruleId, 'satisfied', {
      total_count: 0,
      checked_count: 0,
      normalized_score: 1,
      normalized_coverage: 1,
    });
  if (!checked)
    return finalizeEvaluation(ruleId, 'unknown', {
      reason: 'insufficient_evidence',
      total_count: total,
      checked_count: 0,
    });
  const outcome = !failures
    ? checked < total
      ? 'unknown'
      : 'satisfied'
    : failures === checked
      ? 'missing'
      : 'partial';
  return finalizeEvaluation(ruleId, outcome, {
    total_count: total,
    checked_count: checked,
    failure_count: failures,
    failing_urls: bounded(unique),
    normalized_score: (checked - failures) / checked,
    normalized_coverage: checked / total,
  });
}

export function canonicalIntegrity(input: {
  declarations: string[];
  finalUrl: string;
  targetUrl: string;
  checked: boolean;
  statusCode: number | null;
  redirected: boolean;
}) {
  const unique = [...new Set(input.declarations.map((value) => value.trim()).filter(Boolean))];
  const evidence = {
    declarations: bounded(unique),
    final_url: input.finalUrl,
    target_url: input.targetUrl,
    redirected: input.redirected,
  };
  const result = (outcome: string, reason: string) =>
    finalizeEvaluation('technical.canonical_integrity', outcome, { ...evidence, reason });
  if (!unique.length) return result('not_applicable', 'no_canonical');
  if (unique.length !== 1) return result('missing', 'conflicting_declarations');
  try {
    const declared = new URL(unique[0]!, input.finalUrl);
    const final = new URL(input.finalUrl);
    if (![declared, final].every((url) => ['http:', 'https:'].includes(url.protocol)))
      return result('missing', 'invalid_canonical');
    if (declared.origin !== final.origin) return result('missing', 'cross_origin_canonical');
  } catch {
    return result('missing', 'invalid_canonical');
  }
  if (!input.checked || input.statusCode === null)
    return result('unknown', 'insufficient_evidence');
  return finalizeEvaluation(
    'technical.canonical_integrity',
    input.statusCode < 400 ? 'satisfied' : 'missing',
    {
      ...evidence,
      status_code: input.statusCode,
    },
  );
}

export function sitemapOrphan(count: number, orphans: string[], coverage: string) {
  const rule = 'technical.sitemap_orphan';
  if (coverage !== 'complete')
    return finalizeEvaluation(rule, 'unknown', {
      reason: 'coverage_not_complete',
      coverage_state: coverage,
    });
  if (!count) return finalizeEvaluation(rule, 'not_applicable', { reason: 'no_sitemap' });
  return finalizeEvaluation(rule, orphans.length ? 'missing' : 'satisfied', {
    sitemap_url_count: count,
    orphan_count: orphans.length,
    orphan_urls: bounded(orphans),
  });
}

export function hreflangConflict(input: {
  alternateCount: number;
  checkedCount: number;
  uncheckedCount: number;
  missingReturnTags: string[];
  rateLimitedCount: number;
}) {
  const rule = 'technical.hreflang_conflict';
  const counts = { alternate_count: input.alternateCount, unchecked_count: input.uncheckedCount };
  if (!input.alternateCount)
    return finalizeEvaluation(rule, 'not_applicable', { reason: 'no_hreflang' });
  if (input.rateLimitedCount && !input.missingReturnTags.length)
    return finalizeEvaluation(rule, 'unknown', {
      ...counts,
      reason: 'rate_limited_alternates',
      checked_count: input.checkedCount,
      rate_limited_count: input.rateLimitedCount,
    });
  if (!input.checkedCount)
    return finalizeEvaluation(rule, 'unknown', {
      ...counts,
      reason: 'no_checkable_alternates',
    });
  return finalizeEvaluation(rule, input.missingReturnTags.length ? 'missing' : 'satisfied', {
    ...counts,
    checked_count: input.checkedCount,
    missing_return_tags: bounded(input.missingReturnTags),
  });
}
