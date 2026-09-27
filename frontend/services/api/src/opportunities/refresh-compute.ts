/**
 * The deterministic half of an Opportunity refresh: scoring and
 * consolidation, the rows and the immutable snapshot one refresh persists,
 * and the snapshot's read projection (`recompute.py`, `snapshot_build.py`,
 * `snapshot_projection.py`, `site_coverage.py`).
 *
 * Pure functions over loaded evidence.
 */
import { randomUUID } from 'node:crypto';

import { policy } from '../config.ts';
import { round } from '../demand/projection.ts';
import { rules } from '../analysis/opportunities/detectors.ts';
import type { DetectorHit } from '../analysis/opportunities/evidence.ts';
import { priorityScore } from '../analysis/opportunities/scoring.ts';
import { emptySourceProjection } from '../analysis/opportunities/source-mix.ts';
import { isoUtc } from '../db/timestamps.ts';
import { promptTextHash } from '../prompts/normalization.ts';
import { record } from '../traffic/performance.ts';
import { compareText } from '../text-order.ts';

const o = policy.opportunity.opportunities;
const a = policy.opportunity.actions;
const r = policy.opportunity.refresh;

export type Scored = [DetectorHit, number];
type Json = Record<string, unknown>;

/** The crawl fields coverage reads. */
export type CoverageCrawl = {
  status: string;
  score_summary: unknown;
  analysis_requested_count: number | null;
  analyzed_url_count: number | null;
  failed_url_count: number | null;
};

/** A stored count, or 0 when absent. */
const integer = (value: unknown): number => Math.trunc(Number(value) || 0);

/** Exactly how much of a terminal crawl feeds detection. */
export function siteCoverage(crawl: CoverageCrawl | null): [Json, string[]] {
  if (crawl === null) return [{}, []];
  const summary = record(crawl.score_summary);
  const selected = integer(
    'selected_count' in summary ? summary.selected_count : crawl.analysis_requested_count || 0,
  );
  const analyzed = integer(crawl.analyzed_url_count);
  const coverage = {
    crawl_status: crawl.status,
    selected_url_count: selected,
    analyzed_url_count: analyzed,
    failed_url_count: integer(crawl.failed_url_count),
    analysis_ratio: selected ? round(analyzed / selected, 4) : null,
  };
  const limitations: string[] = [];
  if (crawl.status !== r.crawl_status_completed) {
    limitations.push(
      `Site Health evidence is partial (${crawl.status}); only completed analyses are included.`,
    );
  }
  if (selected > analyzed) {
    limitations.push(`Coverage: ${analyzed} of ${selected} selected URLs analyzed.`);
  }
  return [coverage, limitations];
}

const mergedIds = (left: string[], right: string[]) =>
  [...new Set([...left, ...right])].sort(compareText);

/** Compare the tie-break fields; positive when `left` wins. */
function preference(left: Scored, right: Scored): number {
  const [lh, ls] = left;
  const [rh, rs] = right;
  const flags = (hit: DetectorHit) =>
    Number(Boolean(hit.title_override)) + Number(Boolean(hit.remediation_override));
  return (
    ls - rs ||
    flags(lh) - flags(rh) ||
    ((lh.title_override ?? '') < (rh.title_override ?? '')
      ? -1
      : (lh.title_override ?? '') > (rh.title_override ?? '')
        ? 1
        : 0) ||
    ((lh.remediation_override ?? '') < (rh.remediation_override ?? '')
      ? -1
      : (lh.remediation_override ?? '') > (rh.remediation_override ?? '')
        ? 1
        : 0)
  );
}

/** Score, drop sub-threshold hits and fold one row per (rule, target). */
export function scoreHits(hits: DetectorHit[]): Scored[] {
  const consolidated = new Map<string, Scored>();
  for (const hit of hits) {
    const rule = rules[hit.rule_id];
    if (!rule) throw new Error(`unknown opportunity rule_id: ${hit.rule_id}`);
    const score = priorityScore(rule.severity, hit.value_factor, hit.gap_factor);
    if (score < o.MIN_PRIORITY_TO_SURFACE) continue;
    const key = JSON.stringify([hit.rule_id, hit.target_key]);
    const current = consolidated.get(key);
    if (current === undefined) {
      consolidated.set(key, [hit, score]);
      continue;
    }
    // `max` keeps the first of two equal candidates.
    const [selected, selectedScore] =
      preference([hit, score], current) > 0 ? [hit, score] : current;
    consolidated.set(key, [
      {
        ...selected,
        source_analysis_ids: mergedIds(current[0].source_analysis_ids, hit.source_analysis_ids),
        source_issue_ids: mergedIds(current[0].source_issue_ids, hit.source_issue_ids),
        source_metric_ids: mergedIds(current[0].source_metric_ids, hit.source_metric_ids),
      },
      selectedScore,
    ]);
  }
  return [...consolidated.values()].sort(
    ([left], [right]) =>
      (left.rule_id < right.rule_id ? -1 : left.rule_id > right.rule_id ? 1 : 0) ||
      (left.target_key < right.target_key ? -1 : left.target_key > right.target_key ? 1 : 0),
  );
}

/** The persisted fields of one new live Opportunity. */
export function newOpportunity(hit: DetectorHit, score: number) {
  const rule = rules[hit.rule_id]!;
  return {
    rule_id: rule.rule_id,
    opportunity_type: rule.opportunity_type,
    severity: rule.severity,
    priority_score: score,
    title: hit.title_override ?? rule.title,
    remediation: hit.remediation_override ?? rule.remediation,
    target_key: hit.target_key,
    target_prompt_id: hit.target_prompt_id,
    target_url: hit.target_url,
    target_theme: hit.target_theme,
    evidence: hit.evidence,
    source_analysis_ids: [...hit.source_analysis_ids],
    source_issue_ids: [...hit.source_issue_ids],
    source_metric_ids: [...hit.source_metric_ids],
    source_traffic_ids: null,
    analyzer_version: o.ANALYZER_VERSION,
    rule_version: o.RULE_VERSION,
    formula_version: o.FORMULA_VERSION,
  };
}

export type NewOpportunity = ReturnType<typeof newOpportunity> & { id: string };

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const sourceIds = (scored: Scored[], field: 'source_analysis_ids' | 'source_issue_ids') =>
  [...new Set(scored.flatMap(([hit]) => hit[field]))].sort(compareText);

export type SnapshotSources = {
  auditId: string | null;
  crawl: (CoverageCrawl & { id: string }) | null;
  demand: { id: string; source_hash: string } | null;
};

/** One immutable refresh snapshot's persisted fields, over the new live set. */
export function buildSnapshot(
  sources: SnapshotSources,
  rows: Pick<NewOpportunity, 'opportunity_type' | 'severity'>[],
  scored: Scored[],
  projections: [Json, Json, Json[]],
) {
  const countsByType: Record<string, number> = Object.fromEntries(
    [...o.OPPORTUNITY_TYPES].sort(compareText).map((name) => [name, 0]),
  );
  const countsBySeverity: Record<string, number> = Object.fromEntries(
    [...o.OPPORTUNITY_SEVERITIES].sort(compareText).map((name) => [name, 0]),
  );
  for (const row of rows) {
    countsByType[row.opportunity_type]! += 1;
    countsBySeverity[row.severity]! += 1;
  }
  const scores = scored.map(([, score]) => score).sort((x, y) => x - y);
  const [coverage, limitations] = siteCoverage(sources.crawl);
  return {
    run_id: randomUUID(),
    audit_id: sources.auditId,
    site_crawl_id: sources.crawl?.id ?? null,
    demand_snapshot_id: sources.demand?.id ?? null,
    demand_source_revision: sources.demand?.source_hash ?? null,
    coverage: Object.keys(coverage).length ? coverage : null,
    limitations,
    source_mix: projections[0],
    action_path_mix: projections[1],
    domain_rollups: projections[2],
    counts_by_type: countsByType,
    counts_by_severity: countsBySeverity,
    total_count: rows.length,
    median_priority: scores.length ? round(median(scores), 1) : null,
    analyzer_version: o.ANALYZER_VERSION,
    rule_version: o.RULE_VERSION,
    formula_version: o.FORMULA_VERSION,
    source_analysis_ids: sourceIds(scored, 'source_analysis_ids'),
    source_issue_ids: sourceIds(scored, 'source_issue_ids'),
  };
}

type GapSnapshot = { prompt_index: number; snapshot_id: string | null; text: string };

/** Stamp the audit and its gap prompts on the source and action-path mixes. */
export function stampSourceProjections(
  auditId: string,
  snapshots: GapSnapshot[],
  gapIndices: number[],
  projections: Json[],
): void {
  const selected = snapshots.filter((row) => gapIndices.includes(row.prompt_index));
  for (const projection of projections) {
    projection.audit_id = auditId;
    projection.prompt_snapshot_ids = selected.map((row) => row.snapshot_id || null);
    projection.gap_keys = selected.map((row) => promptTextHash(row.text)).sort(compareText);
  }
}

/** The canonical "nothing to project" source mix, before any gap. */
export function emptyProjection(): [Json, Json, Json[]] {
  const empty = emptySourceProjection();
  return [empty, { ...empty }, []];
}

export type CurrentSnapshot = {
  audit_id: string | null;
  site_crawl_id: string | null;
  demand_snapshot_id: string | null;
  demand_source_revision: string | null;
  analyzer_version: string;
  rule_version: string;
  formula_version: string;
};

/** Whether the latest snapshot already describes these exact sources. */
export function snapshotIsCurrent(
  current: CurrentSnapshot | null,
  sources: { auditId: string | null; crawlId: string | null; demand: SnapshotSources['demand'] },
): boolean {
  return (
    current !== null &&
    current.audit_id === sources.auditId &&
    current.site_crawl_id === sources.crawlId &&
    current.demand_snapshot_id === (sources.demand?.id ?? null) &&
    current.demand_source_revision === (sources.demand?.source_hash ?? null) &&
    current.analyzer_version === o.ANALYZER_VERSION &&
    current.rule_version === o.RULE_VERSION &&
    current.formula_version === o.FORMULA_VERSION
  );
}

/** Which evidence families one refresh actually had a source for. */
export function availableFamilies(has: { audit: boolean; demand: boolean; crawl: boolean }) {
  const families = new Set<string>();
  if (has.audit)
    [a.FAMILY_AI_VISIBILITY, a.FAMILY_SOURCES, a.FAMILY_COMMERCE].forEach((f) => families.add(f));
  if (has.demand) families.add(a.FAMILY_SEARCH_CONSOLE);
  if (has.crawl)
    [a.FAMILY_SITE_HEALTH, a.FAMILY_LINK_GRAPH, a.FAMILY_SITE_CHANGES].forEach((f) =>
      families.add(f),
    );
  return [...families];
}

/** A persisted snapshot row, as its read projects it. */
export type StoredSnapshot = CurrentSnapshot & {
  id: string;
  run_id: string;
  coverage: unknown;
  limitations: unknown;
  source_mix: unknown;
  action_path_mix: unknown;
  domain_rollups: unknown;
  counts_by_type: unknown;
  counts_by_severity: unknown;
  total_count: number;
  median_priority: number | null;
  created_text: string;
};

const truthyRecord = (value: unknown) => {
  const found = record(value);
  return Object.keys(found).length ? found : null;
};

/** One immutable snapshot, projected without recomputing any metric. */
export function projectSnapshot(snapshot: StoredSnapshot) {
  return {
    id: snapshot.id,
    run_id: snapshot.run_id,
    audit_id: snapshot.audit_id,
    site_crawl_id: snapshot.site_crawl_id,
    demand_snapshot_id: snapshot.demand_snapshot_id,
    demand_source_revision: snapshot.demand_source_revision,
    coverage: record(snapshot.coverage),
    limitations: Array.isArray(snapshot.limitations) ? [...snapshot.limitations] : [],
    source_mix: truthyRecord(snapshot.source_mix) ?? emptySourceProjection(),
    action_path_mix: truthyRecord(snapshot.action_path_mix) ?? emptySourceProjection(),
    domain_rollups: Array.isArray(snapshot.domain_rollups) ? [...snapshot.domain_rollups] : [],
    counts_by_type: record(snapshot.counts_by_type),
    counts_by_severity: record(snapshot.counts_by_severity),
    total_count: snapshot.total_count,
    median_priority: snapshot.median_priority,
    analyzer_version: snapshot.analyzer_version,
    rule_version: snapshot.rule_version,
    formula_version: snapshot.formula_version,
    created_at: isoUtc(snapshot.created_text),
  };
}
