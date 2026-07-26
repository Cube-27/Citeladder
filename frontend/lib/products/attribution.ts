/**
 * Commerce Attribution display helpers — pure, framework-free.
 *
 * A1 (GA4 platform-attributed) and A2 (Shopify order referrer) are
 * cross-checks: this module NEVER sums their revenue, orders, AOV, or
 * conversion values, never converts currencies, and never computes a delta
 * in the browser (the backend projects `A1 − A2`). The view projection here
 * only PAIRS rows within one ISO currency partition and formats persisted
 * values; null stays unavailable (`—`).
 */
import type {
  AttributionDelta,
  AttributionMethod,
  AttributionMethodMetrics,
  AttributionSnapshot,
  AttributionTaskStatus,
  UnattributedMetrics,
} from '@/lib/api/types';
import { formatPercent, formatPrice } from '@/lib/products/catalog';

// The range presets + granularity vocabulary are OWNED by the shared
// analytics options module (the same framework-free options the `/analytics`
// and `/traffic` surfaces use) — re-exported so the attribution surface
// never duplicates date math.
export {
  GRANULARITY_OPTIONS,
  RANGE_OPTIONS,
  rangeLabel,
  rangeToWindow,
} from '@/lib/analytics/options';
export type { AnalyticsGranularity, AnalyticsRange } from '@/lib/analytics/options';

/** Nested Attribution sub-tabs (local React state, NOT mirrored in `?tab=`). */
export type AttributionSubTab = 'overview' | 'by-source' | 'by-product';

export const ATTRIBUTION_SUB_TABS: readonly { id: AttributionSubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'by-source', label: 'By source' },
  { id: 'by-product', label: 'By product' },
] as const;

/** Display-only method labels (the exact user-visible strings). */
export const ATTRIBUTION_METHOD_LABELS: Record<AttributionMethod, string> = {
  ga4_platform_attributed: 'A1 · GA4 platform-attributed',
  order_referrer: 'A2 · Shopify order referrer',
};

export const ATTRIBUTION_DELTA_LABEL = 'Delta · A1 − A2';

export const STATISTICAL_CARD_TITLE = 'Statistical estimate';

export const REDUCED_GRANULARITY_COPY =
  'Reduced GA4 granularity · item revenue is grouped by default channel instead of AI source.';

export const INSUFFICIENT_STATISTICAL_COPY =
  'Insufficient data · no estimate is available for this window.';

/** Exact unattributed summary line (a null share renders `—`, never `0%`). */
export function unattributedSummary(orders: number, orderShare: number | null): string {
  return `Unattributed · ${orders} orders (${formatPercent(orderShare)}) have no referrer evidence.`;
}

// ---------------------------------------------------------------------------
// Metric formatting (persisted values only; null → `—`)
// ---------------------------------------------------------------------------

/** `$48,210.00` / `—` (delegates to the shared catalog price formatter). */
export function formatMoney(amount: number | null | undefined, currency: string | null): string {
  if (amount === null || amount === undefined || currency === null) return '—';
  return formatPrice(amount, currency);
}

/**
 * `0.028` → `2.8%`; null → `—`. Conversion rates keep ONE decimal (unlike
 * `formatPercent`'s integer rounding) so small rates never round to 0%.
 */
export function formatConversionRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

const MINUS = '−'; // U+2212 — the typographic minus the delta card renders.

/** `+$6,330.00` / `−$0.62` / `—` — the backend-projected delta, sign kept. */
export function formatSignedMoney(
  amount: number | null | undefined,
  currency: string | null,
): string {
  if (amount === null || amount === undefined || currency === null) return '—';
  const sign = amount < 0 ? MINUS : '+';
  return `${sign}${formatPrice(Math.abs(amount), currency)}`;
}

/** `+56` / `−3` / `—` — signed integer delta (orders). */
export function formatSignedInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value < 0 ? MINUS : '+';
  return `${sign}${Math.abs(value).toLocaleString('en-US')}`;
}

/** `+2.8%` / `−0.4%` / `—` — signed rate delta (conversion). */
export function formatSignedPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  const sign = rate < 0 ? MINUS : '+';
  return `${sign}${formatConversionRate(Math.abs(rate))}`;
}

// ---------------------------------------------------------------------------
// No-sum currency-partitioned view projection
// ---------------------------------------------------------------------------

/**
 * One ISO currency partition of the deterministic snapshot. `currency` is
 * null only for the unavailable-method block (a workspace where no response
 * ever yielded a currency); method rows are PAIRED within one code and
 * never combined across codes.
 */
export type AttributionCurrencyBlock = {
  currency: string | null;
  a1: AttributionMethodMetrics | undefined;
  a2: AttributionMethodMetrics | undefined;
  delta: AttributionDelta | undefined;
  unattributed: UnattributedMetrics | undefined;
};

/**
 * Build one complete block per ISO code discovered in
 * `metrics.deterministic.{a1,a2,delta,unattributed}` (first-seen order).
 * An unavailable method row (null currency) pairs into blocks that have no
 * exact-code row for that method — so `A1 available USD + A2 not_connected`
 * renders both cards in the USD block — or into a single null-currency
 * block when nothing yielded a currency at all. No cross-currency total,
 * conversion, or delta is ever derived here.
 */
export function buildAttributionBlocks(snapshot: AttributionSnapshot): AttributionCurrencyBlock[] {
  const { a1, a2, delta, unattributed } = snapshot.metrics.deterministic;

  const currencies: string[] = [];
  const note = (code: string | null) => {
    if (code !== null && !currencies.includes(code)) currencies.push(code);
  };
  for (const row of a1) note(row.currency);
  for (const row of a2) note(row.currency);
  for (const row of delta) note(row.currency);
  for (const row of unattributed) note(row.currency);

  const nullA1 = a1.find((row) => row.currency === null);
  const nullA2 = a2.find((row) => row.currency === null);

  const blocks: AttributionCurrencyBlock[] = currencies.map((currency) => ({
    currency,
    a1: a1.find((row) => row.currency === currency) ?? nullA1,
    a2: a2.find((row) => row.currency === currency) ?? nullA2,
    delta: delta.find((row) => row.currency === currency),
    unattributed: unattributed.find((row) => row.currency === currency),
  }));

  // Nothing yielded a currency: pair the unavailable rows in one null block.
  if (blocks.length === 0 && (nullA1 || nullA2)) {
    blocks.push({
      currency: null,
      a1: nullA1,
      a2: nullA2,
      delta: undefined,
      unattributed: undefined,
    });
  }

  return blocks;
}

/** Union of `ai_source` values across A1/A2 source rows (first-seen order). */
export function sourceRowKeys(block: AttributionCurrencyBlock): string[] {
  const keys: string[] = [];
  for (const row of block.a1?.by_ai_source ?? []) {
    if (!keys.includes(row.ai_source)) keys.push(row.ai_source);
  }
  for (const row of block.a2?.by_ai_source ?? []) {
    if (!keys.includes(row.ai_source)) keys.push(row.ai_source);
  }
  return keys;
}

/** Pairing key for per-SKU rows: SKU + the effective source label. */
export function productRowKey(row: {
  sku: string;
  ai_source: string | null;
  source_label: string;
}): string {
  return `${row.sku} ${row.ai_source ?? row.source_label}`;
}

// ---------------------------------------------------------------------------
// Recompute task polling
// ---------------------------------------------------------------------------

/** Poll cadence for an in-flight attribution recompute (mirrors SYNC_RUN_POLL_MS). */
export const ATTRIBUTION_RECOMPUTE_POLL_MS = 3_000;

/** Non-terminal queue statuses — the recompute task keeps polling. */
export function isActiveAttributionTask(status: AttributionTaskStatus): boolean {
  return (
    status === 'queued' || status === 'leased' || status === 'running' || status === 'retry_wait'
  );
}
