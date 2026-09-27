/**
 * Opportunity hits mapped from other owners' persisted signals: approved
 * Change Intelligence regressions, promoted Demand signals and Commerce
 * catalog/shelf gaps (`change_hits.py`, `demand_hits.py`, `commerce_hits.py`).
 *
 * JSON these copy verbatim is read as text so a Python float stays a float.
 */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import { rules } from '../analysis/opportunities/detectors.ts';
import type { DetectorHit } from '../analysis/opportunities/evidence.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { parsePyJsonColumn } from '../python/json.ts';
import { pyCompare, pyStrOrEmpty, pyTruthy } from '../python/text.ts';
import { record } from '../traffic/performance.ts';
import type { DemandSource, Scope } from './sources.ts';

const o = policy.opportunity.opportunities;
const r = policy.opportunity.refresh;
type Json = Record<string, unknown>;

function hit(fields: Omit<DetectorHit, 'title_override' | 'remediation_override'>): DetectorHit {
  return { ...fields, title_override: null, remediation_override: null };
}

// ---------------------------------------------------------------------------
// Change Intelligence
// ---------------------------------------------------------------------------
const RULE_BY_CLASS: Readonly<Record<string, string>> = {
  [r.change_class_regression]: 'site_change_potential_regression',
  [r.change_class_critical]: 'site_change_critical_regression',
};

function changeRule(row: { change_class: string; field: string; after: unknown }): string | null {
  if (Object.hasOwn(RULE_BY_CLASS, row.change_class)) return RULE_BY_CLASS[row.change_class]!;
  const after = row.after;
  if (
    row.field !== r.content_change_field ||
    after === null ||
    typeof after !== 'object' ||
    Array.isArray(after)
  )
    return null;
  const evidence = after as Json;
  if (
    evidence.comparison_coverage !== 'complete' ||
    evidence.metadata_consistency !== 'inconsistent'
  )
    return null;
  return evidence.content_change_classification === 'unchanged'
    ? 'site_change_cosmetic_refresh'
    : 'site_change_metadata_inconsistency';
}

type ChangeCrawl = {
  id: string;
  project_id: string;
  analyzer_version: string;
  extractor_version: string;
};

/** Only approved, unexpected regressions observed for this exact newer crawl. */
export async function changeHits(
  db: Database,
  workspaceId: string,
  crawl: ChangeCrawl,
): Promise<DetectorHit[]> {
  const scope = new WorkspaceScope(workspaceId);
  const snapshot = await scope
    .selectFrom(db, 'site_change_snapshots')
    .select(['id', 'crawl_a_id', 'crawl_b_id', 'complete_pair'])
    .select(sql<string>`coverage::text`.as('coverage_text'))
    .where('project_id', '=', crawl.project_id)
    .where('crawl_b_id', '=', crawl.id)
    .where('state', '=', r.change_state_available)
    .where('analyzer_version', '=', r.change_analyzer_version)
    .where('page_analyzer_version', '=', crawl.analyzer_version)
    .where('extractor_version', '=', crawl.extractor_version)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!snapshot) return [];
  const rows = await scope
    .selectFrom(db, 'site_change_observations')
    .select(['id', 'site_url_id', 'field', 'change_class', 'normalized_url'])
    .select(['source_analysis_a_id', 'source_analysis_b_id'])
    .select([
      sql<string | null>`before_value::text`.as('before_text'),
      sql<string | null>`after_value::text`.as('after_text'),
    ])
    .where('snapshot_id', '=', snapshot.id)
    .where('expected', 'is', false)
    .where((eb) =>
      eb.or([
        eb('change_class', 'in', Object.keys(RULE_BY_CLASS)),
        eb('field', '=', r.content_change_field),
      ]),
    )
    .orderBy('normalized_url')
    .orderBy('field')
    .orderBy('id')
    .limit(r.change_max_observations)
    .execute();
  const pair = { ...snapshot, coverage: parsePyJsonColumn(snapshot.coverage_text) };
  return rows.flatMap((row) => {
    const found = changeHit(pair, {
      ...row,
      before_value: parsePyJsonColumn(row.before_text),
      after_value: parsePyJsonColumn(row.after_text),
    });
    return found ? [found] : [];
  });
}

export type ChangePair = {
  id: string;
  crawl_a_id: string | null;
  crawl_b_id: string;
  complete_pair: boolean;
  coverage: unknown;
};
export type ChangeRow = {
  id: string;
  site_url_id: string;
  field: string;
  change_class: string;
  normalized_url: string;
  source_analysis_a_id: string | null;
  source_analysis_b_id: string | null;
  before_value: unknown;
  after_value: unknown;
};

/** One approved regression as a hit; null for a change nothing promotes. */
export function changeHit(pair: ChangePair, row: ChangeRow): DetectorHit | null {
  const rule = changeRule({
    change_class: row.change_class,
    field: row.field,
    after: row.after_value,
  });
  if (rule === null) return null;
  return hit({
    rule_id: rule,
    target_key: `site-change:${row.site_url_id}:${row.field}`,
    target_prompt_id: null,
    target_url: row.normalized_url,
    target_theme: null,
    evidence: {
      change_snapshot_id: pair.id,
      change_observation_id: row.id,
      // `str(None)`: Python writes the literal when the pair has no older crawl.
      crawl_a_id: pair.crawl_a_id ?? 'None',
      crawl_b_id: pair.crawl_b_id,
      field: row.field,
      before_value: row.before_value,
      after_value: row.after_value,
      change_class: row.change_class,
      complete_pair: pair.complete_pair,
      coverage: { ...record(pair.coverage) },
    },
    source_analysis_ids: [row.source_analysis_a_id, row.source_analysis_b_id].filter(
      (value): value is string => value !== null,
    ),
    source_issue_ids: [],
    source_metric_ids: [pair.id, row.id],
    value_factor: o.SITE_VALUE_FACTOR,
    gap_factor: o.SITE_GAP_FACTOR,
  });
}

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------
/** The Opportunity target key of a promoted signal, stable across snapshots. */
const demandTargetKey = (identityHash: string) => `demand:${identityHash}`;

type DemandSignal = {
  id: string;
  signal_type: string;
  identity_hash: string;
  priority_score: number | null;
  metrics: unknown;
  coverage: unknown;
  limitations: unknown;
  evidence: unknown;
};

function demandTargets(
  kind: string,
  target: string,
  resolved: string,
): [string | null, string | null] {
  if (kind === 'page') return [target, null];
  if (kind === 'query') return [resolved || null, target];
  return [null, null];
}

/** One promoted Demand signal as an Opportunity hit; null without a target. */
export function demandHit(snapshotId: string, signal: DemandSignal): DetectorHit | null {
  const evidence = record(signal.evidence);
  const target = pyStrOrEmpty(evidence.target);
  if (!target) return null;
  const [targetUrl, targetTheme] = demandTargets(
    pyStrOrEmpty(evidence.target_kind),
    target,
    pyStrOrEmpty(evidence.resolved_page_url),
  );
  const ruleIds: Record<string, string> = o.DEMAND_SIGNAL_RULE_IDS;
  const metricIds = evidence.source_metric_row_ids;
  return hit({
    rule_id: ruleIds[signal.signal_type]!,
    target_key: demandTargetKey(signal.identity_hash),
    target_prompt_id: null,
    target_url: targetUrl,
    target_theme: targetTheme,
    evidence: {
      demand_snapshot_id: snapshotId,
      demand_signal_id: signal.id,
      signal_type: signal.signal_type,
      metrics: { ...record(signal.metrics) },
      coverage: { ...record(signal.coverage) },
      limitations: Array.isArray(signal.limitations) ? [...signal.limitations] : [],
      query_relevance: 'query_relevance' in evidence ? evidence.query_relevance : null,
    },
    source_analysis_ids: [],
    source_issue_ids: [],
    source_metric_ids: pyTruthy(metricIds) && Array.isArray(metricIds) ? [...metricIds] : [],
    value_factor: Math.max(0.01, Math.min(1, (signal.priority_score || 0) / 100)),
    gap_factor: o.DEMAND_SIGNAL_GAP_FACTOR,
  });
}

/** The current demand snapshot's active promoted signals, as hits. */
export async function demandHits(
  db: Database,
  scope: Scope,
  snapshot: DemandSource | null,
): Promise<DetectorHit[]> {
  if (snapshot === null) return [];
  const signals = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'demand_signals')
    .select(['id', 'signal_type', 'identity_hash', 'priority_score', 'limitations'])
    .select([
      sql<string>`metrics::text`.as('metrics_text'),
      sql<string>`coverage::text`.as('coverage_text'),
      sql<string>`evidence::text`.as('evidence_text'),
    ])
    .where('project_id', '=', scope.projectId)
    .where('snapshot_id', '=', snapshot.id)
    .where('signal_type', 'in', policy.demand.DEMAND_OPPORTUNITY_SIGNAL_TYPES)
    .where('state', '=', 'active')
    .orderBy('identity_hash')
    .orderBy('id')
    .execute();
  return signals.flatMap((signal) => {
    const found = demandHit(snapshot.id, {
      ...signal,
      metrics: parsePyJsonColumn(signal.metrics_text),
      coverage: parsePyJsonColumn(signal.coverage_text),
      evidence: parsePyJsonColumn(signal.evidence_text),
    });
    return found ? [found] : [];
  });
}

// ---------------------------------------------------------------------------
// Commerce
// ---------------------------------------------------------------------------
function commerceHit(
  rule: string,
  targetKey: string,
  evidence: Json,
  metricIds: string[],
  analysisIds: string[] = [],
): DetectorHit {
  return hit({
    rule_id: rule,
    target_key: targetKey,
    target_prompt_id: null,
    target_url: null,
    target_theme: null,
    evidence,
    source_analysis_ids: analysisIds,
    source_issue_ids: [],
    source_metric_ids: metricIds,
    value_factor: o.COMMERCE_VALUE_FACTOR,
    gap_factor: o.COMMERCE_GAP_FACTOR,
  });
}

type ShelfSnapshot = {
  id: string;
  target_id: string;
  target_kind: string;
  product_visibility: number;
};

export function unmentionedHits(snapshots: ShelfSnapshot[], auditId: string): DetectorHit[] {
  const rule = rules[o.RULE_PRODUCT_NOT_MENTIONED]!;
  if (!rule.enabled) return [];
  return snapshots
    .filter((row) => row.target_kind === 'product' && row.product_visibility === 0)
    .map((row) =>
      commerceHit(
        rule.rule_id,
        `product:${row.target_id}`,
        { product_id: row.target_id, product_visibility: 0, audit_id: auditId },
        [row.id],
      ),
    );
}

const CATALOG_FIELDS = ['name', 'description', 'brand', 'price', 'currency'] as const;
type CatalogProduct = Record<(typeof CATALOG_FIELDS)[number], unknown> & { id: string };

/** A product with an empty catalog field and at least one observation. */
export function missingFieldHit(
  product: CatalogProduct,
  observationIds: string[],
): DetectorHit | null {
  const missing = CATALOG_FIELDS.filter(
    (field) => product[field] === null || product[field] === '',
  );
  if (!missing.length || !observationIds.length) return null;
  return commerceHit(
    o.RULE_CATALOG_FIELDS_MISSING,
    `product:${product.id}`,
    { product_id: product.id, product_name: product.name, missing_fields: missing },
    observationIds,
  );
}

async function catalogFieldHits(db: Database, scope: Scope): Promise<DetectorHit[]> {
  const rule = rules[o.RULE_CATALOG_FIELDS_MISSING]!;
  if (!rule.enabled) return [];
  const workspace = new WorkspaceScope(scope.workspaceId);
  const products = await workspace
    .selectFrom(db, 'commerce_products')
    .select(['id', ...CATALOG_FIELDS])
    .where('project_id', '=', scope.projectId)
    .where('lifecycle_state', '=', 'active')
    .orderBy('id')
    .execute();
  const observations = await workspace
    .selectFrom(db, 'commerce_product_observations')
    .select(['id', 'product_id'])
    .where('project_id', '=', scope.projectId)
    .orderBy('id')
    .execute();
  const byProduct = new Map<string, string[]>();
  for (const row of observations)
    byProduct.set(row.product_id, [...(byProduct.get(row.product_id) ?? []), row.id]);
  return products.flatMap((product) => {
    const found = missingFieldHit(product, byProduct.get(product.id) ?? []);
    return found ? [found] : [];
  });
}

async function alternativeHits(
  db: Database,
  workspaceId: string,
  snapshots: ShelfSnapshot[],
  auditId: string,
): Promise<DetectorHit[]> {
  const rule = rules[o.RULE_CITED_ALTERNATIVES]!;
  if (!rule.enabled) return [];
  const results: DetectorHit[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.target_kind !== 'category' || snapshot.product_visibility !== 0) continue;
    const citations = await new WorkspaceScope(workspaceId)
      .selectFrom(db, 'citations')
      .innerJoin('response_analyses', 'response_analyses.id', 'citations.analysis_id')
      .innerJoin('audit_tasks', 'audit_tasks.id', 'response_analyses.task_id')
      .innerJoin(
        'audit_prompt_snapshots',
        'audit_prompt_snapshots.id',
        'audit_tasks.prompt_snapshot_id',
      )
      .innerJoin(
        'commerce_prompt_targets',
        'commerce_prompt_targets.prompt_id',
        'audit_prompt_snapshots.prompt_id',
      )
      .select('citations.analysis_id')
      .where('audit_tasks.audit_id', '=', auditId)
      .where('commerce_prompt_targets.target_kind', '=', 'category')
      .where('commerce_prompt_targets.target_id', '=', snapshot.target_id)
      .where('citations.classification', '=', 'third_party')
      .orderBy('citations.analysis_id')
      .orderBy('citations.ordinal')
      .execute();
    if (!citations.length) continue;
    results.push(
      commerceHit(
        rule.rule_id,
        `category:${snapshot.target_id}`,
        {
          category_id: snapshot.target_id,
          third_party_citation_count: citations.length,
          product_visibility: 0,
          audit_id: auditId,
        },
        [snapshot.id],
        [...new Set(citations.map((row) => row.analysis_id))],
      ),
    );
  }
  return results;
}

/** Commerce catalog and shelf gaps for one audit, in (rule, target) order. */
export async function commerceHits(
  db: Database,
  scope: Scope,
  auditId: string,
): Promise<DetectorHit[]> {
  const snapshots = await new WorkspaceScope(scope.workspaceId)
    .selectFrom(db, 'commerce_shelf_snapshots')
    .select(['id', 'target_id', 'target_kind', 'product_visibility'])
    .where('project_id', '=', scope.projectId)
    .where('audit_id', '=', auditId)
    .orderBy('id')
    .execute();
  const hits = [
    ...unmentionedHits(snapshots, auditId),
    ...(await catalogFieldHits(db, scope)),
    ...(await alternativeHits(db, scope.workspaceId, snapshots, auditId)),
  ];
  return hits.sort(
    (a, b) => pyCompare(a.rule_id, b.rule_id) || pyCompare(a.target_key, b.target_key),
  );
}
