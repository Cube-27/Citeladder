import type { CommerceProductPage } from '@citeladder/contracts/commerce-suite';
import type { ExpectedCheck } from '@citeladder/contracts/opportunities';
import { sql } from 'kysely';

import type { DetectorHit } from '../analysis/opportunities/evidence.ts';
import { rules } from '../analysis/opportunities/detectors.ts';
import { isOwnedHost, ownedHosts } from '../commerce/discovery-validation.ts';
import { productMetrics, scopedSlots, type ExecutionScope } from '../commerce/products.ts';
import type { CommerceScope } from '../commerce/reads.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';

const o = policy.opportunity.opportunities;
const m = o.PRODUCT_METRICS;

type ProductMetricCheck = Extract<ExpectedCheck, { kind: 'product_metric' }>;
export type ProductMetricRule = Pick<
  ProductMetricCheck,
  'metric' | 'comparison' | 'target' | 'min_samples'
>;
export type ProductMetricRuleId = keyof typeof m.RULES;
type ProductRow = CommerceProductPage['items'][number];

export const isProductMetricRule = (id: string): id is ProductMetricRuleId =>
  Object.hasOwn(m.RULES, id);

export const productMetricRule = (id: ProductMetricRuleId): ProductMetricRule => m.RULES[id];

export type MetricReading =
  | { state: 'measured'; value: number; samples: number }
  | {
      state: 'insufficient';
      samples: number;
      reason: 'quotes_in_other_currencies' | 'too_few_samples';
    }
  | { state: 'unknown'; reason: 'no_catalog_price' };

type Raw =
  | { value: number | null; samples: number; excluded: number }
  | { unknown: 'no_catalog_price' };

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function priceGap(price: number, catalog: { min: number; max: number }) {
  if (price < catalog.min) return (catalog.min - price) / catalog.min;
  if (price > catalog.max) return (price - catalog.max) / catalog.max;
  return 0;
}

function raw(
  metric: ProductMetricRule['metric'],
  row: ProductRow,
  executions: number,
  owned: readonly string[],
): Raw {
  switch (metric) {
    case 'appearances':
      return { value: row.appearances, samples: executions, excluded: 0 };
    case 'win_rate':
      return { value: row.win_rate, samples: row.ordered_appearances, excluded: 0 };
    case 'price_gap_share': {
      const catalog = row.catalog_price;
      if (!catalog?.currency || catalog.min <= 0) return { unknown: 'no_catalog_price' };
      const { median, currency, quoted, other_currency: excluded } = row.mentioned_price;
      if (median === null || currency !== catalog.currency)
        return { value: null, samples: 0, excluded };
      return { value: priceGap(median, catalog), samples: quoted, excluded };
    }
    case 'owned_merchant_answers':
      return {
        value: sum(
          row.merchants.filter((item) => isOwnedHost(item.domain, owned)).map((item) => item.count),
        ),
        samples: sum(row.merchants.map((item) => item.count)),
        excluded: 0,
      };
    default: {
      const _exhaustive: never = metric;
      return _exhaustive;
    }
  }
}

export function readMetric(
  rule: ProductMetricRule,
  row: ProductRow,
  executions: number,
  owned: readonly string[],
): MetricReading {
  const found = raw(rule.metric, row, executions, owned);
  if ('unknown' in found) return { state: 'unknown', reason: found.unknown };
  if (found.value === null || found.samples < rule.min_samples)
    return {
      state: 'insufficient',
      samples: found.samples,
      reason:
        found.samples === 0 && found.excluded > 0
          ? 'quotes_in_other_currencies'
          : 'too_few_samples',
    };
  return { state: 'measured', value: found.value, samples: found.samples };
}

export const clears = (rule: ProductMetricRule, value: number) =>
  rule.comparison === 'at_least' ? value >= rule.target : value <= rule.target;

function catalogQuery(scope: ExecutionScope, holder?: string) {
  return {
    ...scope,
    source: 'catalog' as const,
    category: null,
    q: null,
    sort: 'name' as const,
    allMerchants: true,
    ...(holder === undefined ? {} : { holder }),
  };
}

export async function productRow(
  db: Database,
  scope: CommerceScope,
  executions: ExecutionScope,
  productId: string,
) {
  const page = await productMetrics(db, scope, {
    ...catalogQuery(executions, productId),
    cursor: null,
    limit: 1,
  });
  const [row] = page.items;
  return row ? { row, executions: page.executions } : null;
}

async function catalogRows(db: Database, scope: CommerceScope, executions: ExecutionScope) {
  const rows: ProductRow[] = [];
  let total = 0;
  let cursor: string | null = null;
  do {
    const query = { ...catalogQuery(executions), cursor, limit: m.PAGE_SIZE };
    const page: CommerceProductPage = await productMetrics(db, scope, query); // NOSONAR
    total = page.executions;
    rows.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return { rows, executions: total };
}

export async function observationIds(
  db: Database,
  scope: CommerceScope,
  executions: ExecutionScope,
  holders: string[],
): Promise<Map<string, string[]>> {
  if (!holders.length) return new Map();
  const { rows } = await sql<{ holder_id: string; ids: string[] }>`
    WITH ${scopedSlots(scope, executions)}
    SELECT o.holder_id::text AS holder_id, array_agg(o.id::text ORDER BY o.id) AS ids
    FROM observed o WHERE o.holder_id = ANY(${holders}::uuid[])
    GROUP BY o.holder_id
  `.execute(db);
  return new Map(rows.map((row) => [row.holder_id, row.ids]));
}

async function shoppingReach(
  db: Database,
  scope: CommerceScope,
  executions: ExecutionScope,
): Promise<Map<string, number>> {
  const ws = scope.workspaceId,
    project = scope.projectId;
  const { rows } = await sql<{ product_id: string; n: number }>`
    WITH ${scopedSlots(scope, executions)},
    shopping AS (
      SELECT DISTINCT sp.task_id, c.target_kind, c.target_id
      FROM (SELECT DISTINCT task_id FROM scoped_passes) sp
      JOIN audit_tasks t ON t.id = sp.task_id AND t.workspace_id = ${ws}
      JOIN audit_prompt_snapshots s ON s.id = t.prompt_snapshot_id AND s.audit_id = t.audit_id
      JOIN commerce_prompt_targets c ON c.prompt_id = s.prompt_id
        AND c.workspace_id = ${ws} AND c.project_id = ${project}
    ),
    reach AS (
      SELECT sh.task_id, sh.target_id AS product_id FROM shopping sh
      WHERE sh.target_kind = 'product'
      UNION
      SELECT sh.task_id, m.product_id FROM shopping sh
      JOIN commerce_product_categories m ON m.category_id = sh.target_id
        AND m.workspace_id = ${ws} AND m.project_id = ${project}
      WHERE sh.target_kind = 'category'
    )
    SELECT product_id::text AS product_id, count(DISTINCT task_id)::int AS n
    FROM reach GROUP BY product_id
  `.execute(db);
  return new Map(rows.map((row) => [row.product_id, row.n]));
}

function unreachedLimitation(count: number) {
  return count === 1
    ? 'Mentions not checked for 1 catalog product: no audited shopping prompt asks about it or its category.'
    : `Mentions not checked for ${count} catalog products: no audited shopping prompt asks about them or their category.`;
}

function evidence(
  row: ProductRow,
  rule: ProductMetricRule,
  reading: Extract<MetricReading, { state: 'measured' }>,
  context: { asOf: Date; executions: number },
) {
  return {
    product_id: row.holder_id,
    product_name: row.name,
    window_days: m.WINDOW_DAYS,
    as_of: context.asOf.toISOString(),
    executions: context.executions,
    metric: rule.metric,
    value: reading.value,
    samples: reading.samples,
    threshold: rule.target,
    appearances: row.appearances,
    ordered_appearances: row.ordered_appearances,
    win_rate: row.win_rate,
    mentioned_price: {
      median: row.mentioned_price.median,
      currency: row.mentioned_price.currency,
      quoted: row.mentioned_price.quoted,
    },
    catalog_price: row.catalog_price
      ? { amount: row.catalog_price.min, currency: row.catalog_price.currency }
      : null,
    merchants: row.merchants,
  };
}

export async function productMetricHits(
  db: Database,
  scope: CommerceScope,
  asOf: Date,
): Promise<{ hits: DetectorHit[]; limitations: string[] }> {
  const enabled = Object.keys(m.RULES)
    .filter(isProductMetricRule)
    .filter((id) => rules[id]?.enabled);
  if (!enabled.length) return { hits: [], limitations: [] };
  const window: ExecutionScope = {
    windowDays: m.WINDOW_DAYS,
    engine: null,
    promptSet: null,
    until: asOf,
  };
  const { rows, executions } = await catalogRows(db, scope, window);
  const owned = await ownedHosts(db, scope);
  const reach = await shoppingReach(db, scope, window);
  const unreached = new Set<string>();
  const found = enabled.flatMap((id) =>
    rows.flatMap((row) => {
      const rule = productMetricRule(id);
      const asked = rule.metric === 'appearances';
      const measured = asked ? (reach.get(row.holder_id) ?? 0) : executions;
      const reading = readMetric(rule, row, measured, owned);
      if (asked && measured === 0 && !clears(rule, row.appearances)) unreached.add(row.holder_id);
      return reading.state === 'measured' && !clears(rule, reading.value)
        ? [{ id, rule, row, reading, measured }]
        : [];
    }),
  );
  const ids = await observationIds(db, scope, window, [
    ...new Set(found.map((item) => item.row.holder_id)),
  ]);
  const hits = found.map(({ id, rule, row, reading, measured }) => ({
    rule_id: id,
    target: { kind: 'product' as const, product_id: row.holder_id },
    evidence: evidence(row, rule, reading, { asOf, executions: measured }),
    source_analysis_ids: [],
    source_issue_ids: [],
    source_metric_ids: ids.get(row.holder_id) ?? [],
    value_factor: o.COMMERCE_VALUE_FACTOR,
    gap_factor: o.COMMERCE_GAP_FACTOR,
  }));
  return { hits, limitations: unreached.size ? [unreachedLimitation(unreached.size)] : [] };
}
