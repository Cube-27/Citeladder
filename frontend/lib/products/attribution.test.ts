/**
 * Pure attribution formatter/projection tests: the exact user-visible labels,
 * the signed delta formatters (U+2212), and the no-sum currency-partitioned
 * view projection. No component rendering — the panel tests cover the DOM.
 */
import { describe, expect, it } from 'vitest';

import type { AttributionMethodMetrics, AttributionSnapshot } from '@/lib/api/types';

import {
  ATTRIBUTION_DELTA_LABEL,
  ATTRIBUTION_METHOD_LABELS,
  INSUFFICIENT_STATISTICAL_COPY,
  REDUCED_GRANULARITY_COPY,
  buildAttributionBlocks,
  formatConversionRate,
  formatMoney,
  formatSignedInt,
  formatSignedMoney,
  formatSignedPercent,
  isActiveAttributionTask,
  productRowKey,
  sourceRowKeys,
  unattributedSummary,
} from './attribution';

describe('exact user-visible labels', () => {
  it('pins the method/delta/alert copy verbatim', () => {
    expect(ATTRIBUTION_METHOD_LABELS.ga4_platform_attributed).toBe('A1 · GA4 platform-attributed');
    expect(ATTRIBUTION_METHOD_LABELS.order_referrer).toBe('A2 · Shopify order referrer');
    expect(ATTRIBUTION_DELTA_LABEL).toBe('Delta · A1 − A2');
    expect(REDUCED_GRANULARITY_COPY).toBe(
      'Reduced GA4 granularity · item revenue is grouped by default channel instead of AI source.',
    );
    expect(INSUFFICIENT_STATISTICAL_COPY).toBe(
      'Insufficient data · no estimate is available for this window.',
    );
  });

  it('composes the unattributed summary; a null share is —, never 0%', () => {
    expect(unattributedSummary(146, 0.29)).toBe(
      'Unattributed · 146 orders (29%) have no referrer evidence.',
    );
    expect(unattributedSummary(3, null)).toBe(
      'Unattributed · 3 orders (—) have no referrer evidence.',
    );
  });
});

describe('metric formatters', () => {
  it('formats money only with a currency; null stays —', () => {
    expect(formatMoney(48210, 'USD')).toBe('$48,210.00');
    expect(formatMoney(100, 'CHF')).toBe('100.00 CHF');
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney(48210, null)).toBe('—');
  });

  it('keeps one decimal on conversion rates so small rates never round to 0%', () => {
    expect(formatConversionRate(0.028)).toBe('2.8%');
    expect(formatConversionRate(0.031)).toBe('3.1%');
    expect(formatConversionRate(null)).toBe('—');
  });

  it('formats signed deltas with + and the typographic minus', () => {
    expect(formatSignedMoney(6330, 'USD')).toBe('+$6,330.00');
    expect(formatSignedMoney(-0.62, 'USD')).toBe('−$0.62');
    expect(formatSignedMoney(null, 'USD')).toBe('—');
    expect(formatSignedInt(56)).toBe('+56');
    expect(formatSignedInt(-3)).toBe('−3');
    expect(formatSignedInt(null)).toBe('—');
    expect(formatSignedPercent(0.028)).toBe('+2.8%');
    expect(formatSignedPercent(-0.004)).toBe('−0.4%');
    expect(formatSignedPercent(null)).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// buildAttributionBlocks — the no-sum currency partition
// ---------------------------------------------------------------------------

const metricSet = (currency: string | null) => ({
  currency,
  revenue: currency === null ? null : 100,
  orders: currency === null ? null : 2,
  average_order_value: currency === null ? null : 50,
  sessions: null,
  conversion_rate: null,
});

function methodRow(
  method: 'ga4_platform_attributed' | 'order_referrer',
  currency: string | null,
  state: 'available' | 'no_data' | 'not_connected' = 'available',
): AttributionMethodMetrics {
  return {
    method,
    state,
    source_granularity:
      method === 'ga4_platform_attributed' && state === 'available'
        ? 'session_source_medium'
        : null,
    reduced_granularity: false,
    currency,
    coverage_rate: null,
    totals: metricSet(currency),
    by_ai_source: [],
    by_product: [],
  };
}

function snapshotWith(
  deterministic: Partial<AttributionSnapshot['metrics']['deterministic']>,
): AttributionSnapshot {
  return {
    project_id: '11111111-1111-4111-8111-111111111111',
    window_start: '2026-06-25',
    window_end: '2026-07-24',
    granularity: 'week',
    metrics: {
      deterministic: {
        a1: [],
        a2: [],
        delta: [],
        unattributed: [],
        coverage: {
          total_latest_orders: 0,
          orders_with_evidence: 0,
          linked_ai_orders: 0,
          unattributed_orders: 0,
          evidence_coverage_rate: null,
          attributed_share: null,
          window_start: '2026-06-25',
          window_end: '2026-07-24',
        },
        ...deterministic,
      },
      statistical: { state: 'not_offered', sample_size: null, allocations: [] },
    },
    source_link_ids: [],
    source_order_fact_ids: [],
    source_metric_row_ids: [],
    source_snapshot_ids: [],
    formula_version: 'attribution-formula-1',
    analyzer_version: 'attribution-analysis-1',
    created_at: null,
  };
}

describe('buildAttributionBlocks', () => {
  it('pairs A1/A2/delta/unattributed per ISO code, first-seen order', () => {
    const snapshot = snapshotWith({
      a1: [
        methodRow('ga4_platform_attributed', 'USD'),
        methodRow('ga4_platform_attributed', 'EUR'),
      ],
      a2: [methodRow('order_referrer', 'USD'), methodRow('order_referrer', 'EUR')],
      delta: [
        {
          currency: 'USD',
          state: 'comparable',
          revenue: 10,
          orders: 1,
          average_order_value: 1,
          conversion_rate: null,
        },
        {
          currency: 'EUR',
          state: 'comparable',
          revenue: -5,
          orders: -1,
          average_order_value: -1,
          conversion_rate: null,
        },
      ],
      unattributed: [
        { currency: 'USD', orders: 3, order_share: 0.1, revenue: 30 },
        { currency: 'EUR', orders: 1, order_share: null, revenue: null },
      ],
    });
    const blocks = buildAttributionBlocks(snapshot);
    expect(blocks.map((block) => block.currency)).toEqual(['USD', 'EUR']);
    // No cross-currency total/conversion/delta: each block carries ONLY its
    // own code's persisted rows.
    expect(blocks[0]?.delta?.revenue).toBe(10);
    expect(blocks[1]?.delta?.revenue).toBe(-5);
    expect(blocks[1]?.unattributed?.order_share).toBeNull();
  });

  it('pairs an unavailable (null-currency) method into the currency block', () => {
    const snapshot = snapshotWith({
      a1: [methodRow('ga4_platform_attributed', 'USD')],
      a2: [methodRow('order_referrer', null, 'not_connected')],
    });
    const blocks = buildAttributionBlocks(snapshot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.currency).toBe('USD');
    expect(blocks[0]?.a2?.state).toBe('not_connected');
    expect(blocks[0]?.delta).toBeUndefined();
  });

  it('yields a single null-currency block when nothing yielded a currency', () => {
    const snapshot = snapshotWith({
      a1: [methodRow('ga4_platform_attributed', null, 'not_connected')],
      a2: [methodRow('order_referrer', null, 'not_connected')],
    });
    const blocks = buildAttributionBlocks(snapshot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.currency).toBeNull();
  });

  it('yields no blocks for the empty contract', () => {
    expect(buildAttributionBlocks(snapshotWith({}))).toEqual([]);
  });
});

describe('sourceRowKeys / productRowKey', () => {
  it('unions A1/A2 source keys in first-seen order', () => {
    const block = {
      currency: 'USD',
      a1: {
        ...methodRow('ga4_platform_attributed', 'USD'),
        by_ai_source: [
          { ai_source: 'chatgpt' as const, currency: 'USD', metrics: metricSet('USD') },
          { ai_source: 'gemini' as const, currency: 'USD', metrics: metricSet('USD') },
        ],
      },
      a2: {
        ...methodRow('order_referrer', 'USD'),
        by_ai_source: [
          { ai_source: 'gemini' as const, currency: 'USD', metrics: metricSet('USD') },
          { ai_source: 'copilot' as const, currency: 'USD', metrics: metricSet('USD') },
        ],
      },
      delta: undefined,
      unattributed: undefined,
    };
    expect(sourceRowKeys(block)).toEqual(['chatgpt', 'gemini', 'copilot']);
  });

  it('keys product rows by SKU + the effective source label', () => {
    expect(productRowKey({ sku: 'A', ai_source: 'chatgpt', source_label: 'ChatGPT' })).toBe(
      'A chatgpt',
    );
    // Reduced-granularity rows pair on the channel label, never an AI source.
    expect(
      productRowKey({ sku: 'A', ai_source: null, source_label: 'Default channel: Referral' }),
    ).toBe('A Default channel: Referral');
  });
});

describe('isActiveAttributionTask', () => {
  it('polls the queue statuses and stops at terminal ones', () => {
    for (const status of ['queued', 'leased', 'running', 'retry_wait'] as const) {
      expect(isActiveAttributionTask(status)).toBe(true);
    }
    for (const status of ['succeeded', 'failed', 'cancelled'] as const) {
      expect(isActiveAttributionTask(status)).toBe(false);
    }
  });
});
