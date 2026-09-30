import { policy } from '../../config.ts';
import { round } from '../../demand/projection.ts';
import type { AnalysisEvidence, CitationEvidence, PromptSnapshotEvidence } from './evidence.ts';
import { byDomain } from './source-patterns.ts';
import { compareText } from '../../text-order.ts';
const p = policy.opportunity.earned_actions;
const s = policy.opportunity.source_patterns;
const sorted = (values: Iterable<string>) => [...values].sort(compareText);
function observedPath(kind: string): string {
  if (kind === s.SOURCE_CLASS_BRAND_OWNED) return p.ACTION_PATH_OWNED;
  return kind === s.SOURCE_CLASS_COMPETITOR_OWNED ? 'competitive_evidence' : p.ACTION_PATH_EARNED;
}
function actionPath(kind: string): string | null {
  if ([s.SOURCE_CLASS_BRAND_OWNED, s.SOURCE_CLASS_COMPETITOR_OWNED].includes(kind))
    return p.ACTION_PATH_OWNED;
  return [s.SOURCE_CLASS_OTHER_THIRD_PARTY, s.SOURCE_CLASS_SEARCH_SURFACE].includes(kind)
    ? null
    : p.ACTION_PATH_EARNED;
}
function empty(state: string, eligible: number, limitations: string[]) {
  return {
    state,
    projection_version: s.SOURCE_MIX_PROJECTION_VERSION,
    taxonomy_version: s.SOURCE_TAXONOMY_VERSION,
    counts: {},
    percentages: {},
    observation_count: 0,
    answers_with_sources: 0,
    eligible_analyzed_answers: eligible,
    coverage_rate: eligible ? 0 : null,
    limitations,
  };
}
export const emptySourceProjection = () =>
  empty('not_applicable', 0, ['No qualifying visibility gap.']);
function mix(counts: Map<string, number>, eligible: number, answers: number) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const keys = sorted(counts.keys());
  return {
    state: 'available',
    projection_version: s.SOURCE_MIX_PROJECTION_VERSION,
    taxonomy_version: s.SOURCE_TAXONOMY_VERSION,
    counts: Object.fromEntries(keys.map((k) => [k, counts.get(k)])),
    percentages: Object.fromEntries(keys.map((k) => [k, round((counts.get(k)! * 100) / total, 1)])),
    observation_count: total,
    answers_with_sources: answers,
    eligible_analyzed_answers: eligible,
    coverage_rate: eligible ? round(answers / eligible, 4) : null,
    limitations: [],
  };
}
type Rollup = {
  canonical_domain: string;
  source_class: string;
  pathway: string | null;
  analysis_ids: Set<string>;
  artifact_ids: Set<string>;
  prompt_indices: Set<number>;
  themes: Set<string>;
  competitors: Set<string>;
  citations: Map<string, string>;
};
function project(value: Rollup, eligible: number) {
  const count = value.analysis_ids.size;
  const rate = eligible ? count / eligible : 0;
  const citations = [...value.citations].sort(([a], [b]) => compareText(a, b));
  const prompts = [...value.prompt_indices].sort((a, b) => a - b);
  return {
    canonical_domain: value.canonical_domain,
    source_class: value.source_class,
    pathway: value.pathway,
    answer_count: count,
    distinct_prompt_count: prompts.length,
    prompt_indices: prompts.slice(0, p.SOURCE_ROLLUP_MAX_PROMPTS),
    themes: sorted(value.themes).slice(0, p.SOURCE_ROLLUP_MAX_PROMPTS),
    competitors: sorted(value.competitors).slice(0, p.SOURCE_ROLLUP_MAX_PROMPTS),
    usage_numerator: count,
    usage_denominator: eligible,
    usage_percentage: round(rate * 100, 1),
    coverage_state: 'available',
    analysis_ids: sorted(value.analysis_ids),
    artifact_ids: sorted(value.artifact_ids),
    representative_citations: citations
      .slice(0, p.SOURCE_ROLLUP_MAX_URLS)
      .map(([url, title]) => ({ url, title })),
    truncated:
      citations.length > p.SOURCE_ROLLUP_MAX_URLS || prompts.length > p.SOURCE_ROLLUP_MAX_PROMPTS,
    actionable:
      value.pathway === p.ACTION_PATH_EARNED &&
      count >= p.EARNED_SOURCE_MIN_ANSWERS &&
      rate >= p.EARNED_SOURCE_MIN_USAGE_RATE,
    usage_factor: round(Math.min(p.EARNED_USAGE_FACTOR_MAX, 1 + rate), 4),
    competitor_cooccurrence_factor: round(
      Math.min(
        p.EARNED_COMPETITOR_FACTOR_MAX,
        1 + value.competitors.size * p.EARNED_COMPETITOR_FACTOR_STEP,
      ),
      4,
    ),
    suggested_role:
      (p.EARNED_SUGGESTED_ROLE_BY_CLASS as Record<string, string>)[value.source_class] ??
      p.EARNED_SOURCE_DEFAULT_ROLE,
    suggested_skill_id:
      (p.EARNED_SUGGESTED_SKILL_BY_CLASS as Record<string, string>)[value.source_class] ??
      p.EARNED_SOURCE_DEFAULT_SKILL,
  };
}
function increment(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
function newRollup(domain: string, kind: string, path: Rollup['pathway']): Rollup {
  return {
    canonical_domain: domain,
    source_class: kind,
    pathway: path,
    analysis_ids: new Set(),
    artifact_ids: new Set(),
    prompt_indices: new Set(),
    themes: new Set(),
    competitors: new Set(),
    citations: new Map(),
  };
}
function addToRollup(
  item: Rollup,
  row: AnalysisEvidence,
  theme: string | null | undefined,
  citation: CitationEvidence,
) {
  item.analysis_ids.add(row.analysis_id);
  if (row.artifact_id !== null) item.artifact_ids.add(row.artifact_id);
  item.prompt_indices.add(row.prompt_index);
  if (theme) item.themes.add(theme);
  for (const name of row.competitor_names) item.competitors.add(name);
  if (!item.citations.has(citation.url)) item.citations.set(citation.url, citation.title);
}
export function buildSourceProjection(
  analyses: AnalysisEvidence[],
  snapshots: PromptSnapshotEvidence[],
  gapIndices: number[],
) {
  if (!gapIndices.length) return [emptySourceProjection(), emptySourceProjection(), []];
  const rows = analyses.filter((a) => gapIndices.includes(a.prompt_index));
  const meta = new Map(snapshots.map((s) => [s.prompt_index, s]));
  const observed = new Map<string, number>();
  const actions = new Map<string, number>();
  const rollups = new Map<string, Rollup>();
  let answers = 0;
  for (const row of rows) {
    const domains = byDomain(row.citations);
    if (domains.size) answers++;
    const theme = meta.get(row.prompt_index)?.theme;
    for (const [domain, [kind, citation]] of domains) {
      const path = actionPath(kind);
      increment(observed, observedPath(kind));
      if (path) increment(actions, path);
      const item = rollups.get(domain) ?? newRollup(domain, kind, path);
      addToRollup(item, row, theme, citation);
      rollups.set(domain, item);
    }
  }
  if (!observed.size) {
    const value = empty('unavailable', rows.length, [
      'Gap answers had no usable citation domains.',
    ]);
    return [value, { ...value }, []];
  }
  const projected = [...rollups.values()]
    .map((v) => project(v, rows.length))
    .sort(
      (a, b) =>
        b.answer_count - a.answer_count || compareText(a.canonical_domain, b.canonical_domain),
    );
  return [
    mix(observed, rows.length, answers),
    actions.size
      ? mix(actions, rows.length, answers)
      : empty('unavailable', rows.length, ['No class-specific action path was observed.']),
    projected.slice(0, p.SOURCE_ROLLUP_MAX_DOMAINS).map((row) => ({
      ...row,
      projection_truncated: projected.length > p.SOURCE_ROLLUP_MAX_DOMAINS,
    })),
  ];
}
