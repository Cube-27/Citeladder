import { policy } from '../config.ts';
import { round } from '../demand/projection.ts';
import { record } from '../traffic/performance.ts';
import { epochMicros, parseDatetime } from '../http/datetimes.ts';
const p = policy.opportunity.placement;
export type Evaluation = {
  observed: number;
  matched: number;
  contradicted: boolean;
  analysis_ids: Set<string>;
  rule_evaluation_ids: Set<string>;
  metric_ids: Set<string>;
  limitations: string[];
};
export const evaluation = (): Evaluation => ({
  observed: 0,
  matched: 0,
  contradicted: false,
  analysis_ids: new Set(),
  rule_evaluation_ids: new Set(),
  metric_ids: new Set(),
  limitations: [],
});
function metricMatches(
  direction: unknown,
  value: number,
  expected: number,
  tolerance: number,
): boolean {
  if (direction === 'increase') return value >= expected - tolerance;
  if (direction === 'decrease') return value <= expected + tolerance;
  return direction === 'equal' && Math.abs(value - expected) <= tolerance;
}
const numeric = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
function metricValue(
  snapshot: { visibility_score: unknown; metrics: unknown },
  index: number | null,
): number | null {
  let value = snapshot.visibility_score;
  if (index !== null) {
    const rows = record(snapshot.metrics).per_prompt;
    value = Array.isArray(rows)
      ? rows.map(record).find((r) => r.prompt_index === index)?.composite_score
      : null;
  }
  return numeric(value) ? Number(value) : null;
}
export function evaluateVisibilityMetric(
  snapshot: { id: string; visibility_score: unknown; metrics: unknown } | undefined,
  check: Record<string, unknown>,
  index: number | null,
  result: Evaluation,
): void {
  if (!snapshot) {
    result.limitations.push('visibility_metric: no metric snapshot');
    return;
  }
  const name = String(check.metric || '');
  const baseline = check.baseline_value;
  if (!numeric(baseline)) {
    result.limitations.push(`visibility_metric: ${name} has no frozen baseline`);
    return;
  }
  const value = metricValue(snapshot, index);
  if (value === null) {
    result.limitations.push(`visibility_metric: ${name} unavailable`);
    return;
  }
  result.observed++;
  result.metric_ids.add(snapshot.id);
  if (
    metricMatches(
      check.direction,
      value - Number(baseline),
      Number(check.min_delta || 0),
      Number(check.tolerance || 0),
    )
  )
    result.matched++;
  else result.contradicted = true;
}
export function evaluateTrafficMetric(
  snapshot: { id: string; metrics: unknown } | undefined,
  check: Record<string, unknown>,
  result: Evaluation,
): void {
  const name = String(check.metric || '');
  const value = record(record(snapshot?.metrics).totals)[name];
  if (!snapshot || !numeric(value) || !numeric(check.expected_value)) {
    result.limitations.push(`traffic_metric: ${name} unavailable`);
    return;
  }
  result.observed++;
  result.metric_ids.add(snapshot.id);
  if (
    metricMatches(
      check.direction,
      Number(value),
      Number(check.expected_value),
      Number(check.tolerance || 0),
    )
  )
    result.matched++;
  else result.contradicted = true;
}
export function evaluatePlacementCheck(
  check: { state: string; state_reason: string | null; due_at: unknown } | undefined,
  result: Evaluation,
): void {
  if (!check) {
    result.limitations.push('placement: no check was opened for this page');
    return;
  }
  if (check.state === p.PLACEMENT_STATE_PENDING) {
    result.limitations.push('placement: the page has not been read since');
    return;
  }
  if (![p.PLACEMENT_STATE_SATISFIED, p.PLACEMENT_STATE_UNMET].includes(check.state)) {
    result.limitations.push(`placement: ${check.state_reason || check.state}`);
    return;
  }
  result.observed++;
  if (check.state === p.PLACEMENT_STATE_SATISFIED) result.matched++;
  else if (check.due_at === null) result.contradicted = true;
}
export function observationKind(result: Evaluation, total: number): string | null {
  if (!result.observed) return null;
  if (result.contradicted) return 'contradicted';
  return result.observed === total && result.matched === total ? 'verified' : 'observed';
}
export function valueState(value: number | null): string {
  return value === null ? 'unavailable' : value === 0 ? 'observed_zero' : 'available';
}
export function leg(
  state: string,
  options: {
    baselineId?: string | null;
    postId?: string | null;
    baseline?: number | null;
    post?: number | null;
    versions?: Record<string, unknown>;
    limitations?: string[];
  } = {},
) {
  const {
    baselineId,
    postId,
    baseline = null,
    post = null,
    versions = {},
    limitations = [],
  } = options;
  return {
    state,
    baseline_source_ids: baselineId ? [baselineId] : [],
    post_source_ids: postId ? [postId] : [],
    baseline_value: baseline,
    post_value: post,
    delta: baseline !== null && post !== null ? round(post - baseline, 4) : null,
    versions,
    limitations,
  };
}
export function gapChanges(before: string[], after: string[], hasLatest: boolean) {
  if (!hasLatest) return { no_longer_observed: [], persistent: [], new: [], state: 'not_run' };
  const a = new Set(before);
  const b = new Set(after);
  return {
    no_longer_observed: [...a].filter((k) => !b.has(k)).sort(),
    persistent: [...a].filter((k) => b.has(k)).sort(),
    new: [...b].filter((k) => !a.has(k)).sort(),
    state: 'available',
  };
}

type VisibilityMeasurement = {
  id: string;
  analyzer_version: string;
  scoring_rule_version: string;
  visibility_score: number | null;
};
export function visibilityMeasurementLeg(
  before: VisibilityMeasurement | null,
  after: VisibilityMeasurement | null,
) {
  if (!before || !after)
    return leg('unavailable', { limitations: ['Visibility metric snapshot is unavailable.'] });
  const versions = {
    baseline_analyzer: before.analyzer_version,
    post_analyzer: after.analyzer_version,
  };
  if (
    before.analyzer_version !== after.analyzer_version ||
    before.scoring_rule_version !== after.scoring_rule_version
  )
    return leg('non_comparable', { limitations: ['Analysis or scoring version changed.'] });
  if (before.visibility_score === null || after.visibility_score === null)
    return leg('unavailable', {
      baselineId: before.id,
      postId: after.id,
      versions,
      limitations: ['Visibility metric is unavailable.'],
    });
  return leg(valueState(Number(after.visibility_score)), {
    baselineId: before.id,
    postId: after.id,
    baseline: Number(before.visibility_score),
    post: Number(after.visibility_score),
    versions,
  });
}

type ReferralMeasurement = {
  id: string;
  granularity: string;
  start_text: string;
  end_text: string;
  metrics: unknown;
  analyzer_version: string;
  formula_version: string;
};
export function referralMeasurementLeg(
  before: ReferralMeasurement | null,
  after: ReferralMeasurement | null,
) {
  if (!after) return leg('not_run', { limitations: ['No post-action AI referral snapshot.'] });
  if (!before)
    return leg('unavailable', {
      postId: after.id,
      limitations: ['No baseline AI referral snapshot.'],
    });
  const duration = (row: ReferralMeasurement) =>
    epochMicros(parseDatetime(row.end_text)!) - epochMicros(parseDatetime(row.start_text)!);
  if (before.granularity !== after.granularity || duration(before) !== duration(after))
    return leg('non_comparable', {
      baselineId: before.id,
      postId: after.id,
      limitations: ['Referral windows or granularity differ.'],
    });
  const value = (metrics: unknown) => {
    const m = record(metrics);
    const totals = record(m.totals);
    return Object.hasOwn(totals, 'ai_referrals') ? totals.ai_referrals : m.ai_referrals;
  };
  const a = value(before.metrics);
  const b = value(after.metrics);
  if (!numeric(a) || !numeric(b))
    return leg('unavailable', {
      baselineId: before.id,
      postId: after.id,
      limitations: ['AI referral metric is unavailable.'],
    });
  return leg(valueState(Number(b)), {
    baselineId: before.id,
    postId: after.id,
    baseline: Number(a),
    post: Number(b),
    versions: { analyzer: after.analyzer_version, formula: after.formula_version },
  });
}
