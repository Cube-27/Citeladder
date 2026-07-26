/**
 * attributionApi contract tests (Commerce workspace): the snapshot read path
 * (window + granularity query building), the recompute enqueue/poll cycle,
 * and fail-loud strict validation (incl. the no-fabricated-zero refines).
 * Transport is stubbed at global fetch (mirrors products.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const UUID3 = '33333333-3333-4333-8333-333333333333';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const metricSet = {
  currency: 'USD',
  revenue: 48210.0,
  orders: 412,
  average_order_value: 117.02,
  sessions: 14714,
  conversion_rate: 0.028,
};

const snapshot = {
  project_id: UUID2,
  window_start: '2026-06-25',
  window_end: '2026-07-24',
  granularity: 'week',
  metrics: {
    deterministic: {
      a1: [
        {
          method: 'ga4_platform_attributed',
          state: 'available',
          source_granularity: 'session_source_medium',
          reduced_granularity: false,
          currency: 'USD',
          coverage_rate: null,
          totals: metricSet,
          by_ai_source: [
            { ai_source: 'chatgpt', currency: 'USD', metrics: metricSet },
          ],
          by_product: [
            {
              product_id: UUID,
              sku: 'AC-VB500',
              name: 'Acme VoltBike 500',
              ai_source: 'chatgpt',
              source_label: 'ChatGPT',
              currency: 'USD',
              revenue: 14220.0,
              orders: 112,
            },
          ],
        },
      ],
      a2: [
        {
          method: 'order_referrer',
          state: 'available',
          source_granularity: null,
          reduced_granularity: false,
          currency: 'USD',
          coverage_rate: 0.71,
          totals: { ...metricSet, revenue: 41880.0, orders: 356, conversion_rate: null },
          by_ai_source: [
            {
              ai_source: 'chatgpt',
              currency: 'USD',
              metrics: { ...metricSet, revenue: 18220.0, orders: 156, conversion_rate: null },
            },
          ],
          by_product: [],
        },
      ],
      delta: [
        {
          currency: 'USD',
          state: 'comparable',
          revenue: 6330.0,
          orders: 56,
          average_order_value: -0.62,
          conversion_rate: null,
        },
      ],
      unattributed: [{ currency: 'USD', orders: 146, order_share: 0.29, revenue: 16940.0 }],
    },
    statistical: { state: 'not_offered', sample_size: null, allocations: [] },
  },
  source_link_ids: [UUID],
  source_order_fact_ids: [UUID3],
  source_metric_row_ids: [],
  source_snapshot_ids: [],
  formula_version: 'attribution-formula-1',
  analyzer_version: 'attribution-analysis-1',
  created_at: '2026-07-24T06:12:00Z',
};

const recomputeTask = {
  task_id: UUID3,
  project_id: UUID2,
  status: 'queued',
  error_code: '',
  updated_at: '2026-07-24T06:12:00Z',
  completed_at: null,
};

describe('attributionApi', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the snapshot with from/to/granularity query params', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(snapshot)));
    vi.stubGlobal('fetch', fetchMock);

    const { attributionApi } = await import('./attribution');
    const latest = await attributionApi.getSnapshot(UUID2, { granularity: 'week' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/api/v1/projects/${UUID2}/commerce/attribution?granularity=week`,
    );
    expect(latest.metrics.deterministic.delta[0]?.revenue).toBe(6330.0);

    await attributionApi.getSnapshot(UUID2, {
      from: '2026-06-25',
      to: '2026-07-24',
      granularity: 'day',
    });
    const params = new URLSearchParams(String(fetchMock.mock.calls[1]?.[0]).split('?')[1]);
    expect(params.get('from')).toBe('2026-06-25');
    expect(params.get('to')).toBe('2026-07-24');
    expect(params.get('granularity')).toBe('day');
  });

  it('posts the recompute with no body and polls the task path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(recomputeTask, 202))
      .mockResolvedValueOnce(jsonResponse({ ...recomputeTask, status: 'succeeded' }));
    vi.stubGlobal('fetch', fetchMock);

    const { attributionApi } = await import('./attribution');
    const enqueued = await attributionApi.recompute(UUID2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/api/v1/projects/${UUID2}/commerce/attribution/recompute`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(enqueued.task_id).toBe(UUID3);

    const polled = await attributionApi.getRecompute(UUID2, UUID3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      `/api/v1/projects/${UUID2}/commerce/attribution/recompute/${UUID3}`,
    );
    expect(polled.status).toBe('succeeded');
  });

  it('fails loud when a revenue row lacks its currency (no fabricated zero)', async () => {
    const drifted = {
      ...snapshot,
      metrics: {
        ...snapshot.metrics,
        deterministic: {
          ...snapshot.metrics.deterministic,
          a1: [
            {
              ...snapshot.metrics.deterministic.a1[0],
              totals: { ...metricSet, currency: null },
            },
          ],
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(drifted));
    vi.stubGlobal('fetch', fetchMock);

    const { attributionApi } = await import('./attribution');
    await expect(attributionApi.getSnapshot(UUID2, {})).rejects.toThrow(
      /API validation failure in attribution\.getSnapshot/,
    );
  });

  it('fails loud when an available A1 row drops source_granularity', async () => {
    const drifted = {
      ...snapshot,
      metrics: {
        ...snapshot.metrics,
        deterministic: {
          ...snapshot.metrics.deterministic,
          a1: [{ ...snapshot.metrics.deterministic.a1[0], source_granularity: null }],
        },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(drifted));
    vi.stubGlobal('fetch', fetchMock);

    const { attributionApi } = await import('./attribution');
    await expect(attributionApi.getSnapshot(UUID2, {})).rejects.toThrow(
      /API validation failure in attribution\.getSnapshot/,
    );
  });

  it('accepts the empty contract (absent snapshot, not a 404)', async () => {
    const empty = {
      ...snapshot,
      window_start: '',
      window_end: '',
      metrics: {
        deterministic: { a1: [], a2: [], delta: [], unattributed: [] },
        statistical: { state: 'not_offered', sample_size: null, allocations: [] },
      },
      source_link_ids: [],
      source_order_fact_ids: [],
      created_at: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(empty));
    vi.stubGlobal('fetch', fetchMock);

    const { attributionApi } = await import('./attribution');
    const parsed = await attributionApi.getSnapshot(UUID2, { granularity: 'week' });
    expect(parsed.metrics.deterministic.a1).toEqual([]);
    expect(parsed.created_at).toBeNull();
  });
});
