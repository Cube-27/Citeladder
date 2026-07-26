/**
 * Attribution tab tests (C5): the persisted A1/A2 snapshot rendered through
 * the REAL query hook with MSW handlers. Covers the exact method labels, the
 * backend delta (never a browser-computed one), the no-sum / no-conversion
 * currency partition, the reduced-granularity + insufficient-data states,
 * and the recompute enqueue → 3s poll → terminal-invalidate cycle.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useAttributionQueries } from '@/lib/products/use-products-screen';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { AttributionPanel } from './attribution-panel';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const TASK = '99999999-9999-4999-8999-999999999999';
const SNAPSHOT_URL = `/api/v1/projects/${PROJECT}/commerce/attribution`;
const RECOMPUTE_URL = `/api/v1/projects/${PROJECT}/commerce/attribution/recompute`;
const TASK_URL = `${RECOMPUTE_URL}/${TASK}`;

function Harness() {
  const queries = useAttributionQueries(PROJECT, true);
  return <AttributionPanel projectId={PROJECT} queries={queries} />;
}

// ---------------------------------------------------------------------------
// Fixtures (persisted shapes — the browser never derives them). Type aliases
// (not interfaces) keep the fixtures assignable to MSW's JsonBodyType.
// ---------------------------------------------------------------------------

type MetricSetFixture = {
  currency: string | null;
  revenue: number | null;
  orders: number | null;
  average_order_value: number | null;
  sessions: number | null;
  conversion_rate: number | null;
};

type ProductRowFixture = {
  product_id: string | null;
  sku: string;
  name: string;
  ai_source: string | null;
  source_label: string;
  currency: string;
  revenue: number | null;
  orders: number | null;
};

type MethodRowFixture = {
  method: string;
  state: string;
  source_granularity: string | null;
  reduced_granularity: boolean;
  currency: string | null;
  coverage_rate: number | null;
  totals: MetricSetFixture;
  by_ai_source: { ai_source: string; currency: string; metrics: MetricSetFixture }[];
  by_product: ProductRowFixture[];
};

type SnapshotFixture = {
  project_id: string;
  window_start: string;
  window_end: string;
  granularity: string;
  metrics: {
    deterministic: {
      a1: MethodRowFixture[];
      a2: MethodRowFixture[];
      delta: {
        currency: string;
        state: string;
        revenue: number | null;
        orders: number | null;
        average_order_value: number | null;
        conversion_rate: number | null;
      }[];
      unattributed: {
        currency: string;
        orders: number;
        order_share: number | null;
        revenue: number | null;
      }[];
      coverage: {
        total_latest_orders: number;
        orders_with_evidence: number;
        linked_ai_orders: number;
        unattributed_orders: number;
        evidence_coverage_rate: number | null;
        attributed_share: number | null;
        window_start: string;
        window_end: string;
      };
    };
    statistical: {
      state: string;
      sample_size: number | null;
      allocations: {
        ai_source: string;
        currency: string;
        estimated_revenue: number | null;
        estimated_orders: number | null;
        estimated_share: number | null;
      }[];
    };
  };
  source_link_ids: string[];
  source_order_fact_ids: string[];
  source_metric_row_ids: string[];
  source_snapshot_ids: string[];
  formula_version: string;
  analyzer_version: string;
  created_at: string | null;
};

const metricSet = (overrides: Partial<MetricSetFixture> = {}): MetricSetFixture => ({
  currency: 'USD',
  revenue: null,
  orders: null,
  average_order_value: null,
  sessions: null,
  conversion_rate: null,
  ...overrides,
});

function methodRow(
  method: 'ga4_platform_attributed' | 'order_referrer',
  currency: string | null,
  overrides: Partial<MethodRowFixture> = {},
): MethodRowFixture {
  return {
    method,
    state: 'available',
    source_granularity: method === 'ga4_platform_attributed' ? 'session_source_medium' : null,
    reduced_granularity: false,
    currency,
    coverage_rate: null,
    totals: metricSet({ currency }),
    by_ai_source: [],
    by_product: [],
    ...overrides,
  };
}

function makeSnapshot(): SnapshotFixture {
  return {
    project_id: PROJECT,
    window_start: '2026-06-25',
    window_end: '2026-07-24',
    granularity: 'week',
    metrics: {
      deterministic: {
        a1: [
          methodRow('ga4_platform_attributed', 'USD', {
            totals: metricSet({
              revenue: 48210.0,
              orders: 412,
              average_order_value: 117.02,
              sessions: 14714,
              conversion_rate: 0.028,
            }),
            by_ai_source: [
              {
                ai_source: 'chatgpt',
                currency: 'USD',
                metrics: metricSet({
                  revenue: 21430.0,
                  orders: 184,
                  average_order_value: 116.47,
                  conversion_rate: 0.031,
                }),
              },
            ],
            by_product: [
              {
                product_id: '22222222-2222-4222-8222-222222222222',
                sku: 'AC-VB500',
                name: 'Acme VoltBike 500',
                ai_source: 'chatgpt',
                source_label: 'ChatGPT',
                currency: 'USD',
                revenue: 14220.0,
                orders: 112,
              },
            ],
          }),
        ],
        a2: [
          methodRow('order_referrer', 'USD', {
            coverage_rate: 0.71,
            totals: metricSet({
              revenue: 41880.0,
              orders: 356,
              average_order_value: 117.64,
            }),
            by_ai_source: [
              {
                ai_source: 'chatgpt',
                currency: 'USD',
                metrics: metricSet({
                  revenue: 18220.0,
                  orders: 156,
                  average_order_value: 116.79,
                }),
              },
            ],
            by_product: [
              {
                product_id: '22222222-2222-4222-8222-222222222222',
                sku: 'AC-VB500',
                name: 'Acme VoltBike 500',
                ai_source: 'chatgpt',
                source_label: 'ChatGPT',
                currency: 'USD',
                revenue: 12640.0,
                orders: 98,
              },
            ],
          }),
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
        coverage: {
          total_latest_orders: 502,
          orders_with_evidence: 356,
          linked_ai_orders: 356,
          unattributed_orders: 146,
          evidence_coverage_rate: 0.71,
          attributed_share: 0.71,
          window_start: '2026-06-25',
          window_end: '2026-07-24',
        },
      },
      statistical: {
        state: 'available',
        sample_size: 146,
        allocations: [
          {
            ai_source: 'ChatGPT',
            currency: 'USD',
            estimated_revenue: 6910.0,
            estimated_orders: 58,
            estimated_share: 0.4,
          },
        ],
      },
    },
    source_link_ids: [],
    source_order_fact_ids: [],
    source_metric_row_ids: [],
    source_snapshot_ids: [],
    formula_version: 'attribution-formula-1',
    analyzer_version: 'attribution-analysis-1',
    created_at: '2026-07-24T06:12:00Z',
  };
}

function useSnapshot(snapshot: SnapshotFixture, counters?: { snapshot: number }) {
  mswServer.use(
    http.get(SNAPSHOT_URL, () => {
      if (counters) counters.snapshot += 1;
      return HttpResponse.json(snapshot);
    }),
  );
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => mswServer.close());

describe('AttributionPanel overview', () => {
  it('renders A1, A2, the backend delta, and the unattributed remainder — never a sum', async () => {
    useSnapshot(makeSnapshot());
    renderWithProviders(<Harness />);

    // Exact method labels + the backend delta label.
    expect(await screen.findByText('A1 · GA4 platform-attributed')).toBeInTheDocument();
    expect(screen.getByText('A2 · Shopify order referrer')).toBeInTheDocument();
    expect(screen.getByText('Delta · A1 − A2')).toBeInTheDocument();

    // Persisted values: revenue, orders, AOV, conversion, coverage.
    expect(screen.getAllByText('$48,210.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$41,880.00').length).toBeGreaterThan(0);
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getAllByText('356').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$117.02').length).toBeGreaterThan(0);
    expect(screen.getByText('2.8%')).toBeInTheDocument();
    expect(screen.getAllByText('71%').length).toBeGreaterThan(0);

    // The backend delta renders signed (U+2212); nothing computes A1 + A2.
    expect(screen.getByText('+$6,330.00')).toBeInTheDocument();
    expect(screen.getByText('+56')).toBeInTheDocument();
    expect(screen.getByText('−$0.62')).toBeInTheDocument();
    expect(screen.queryByText('$90,090.00')).not.toBeInTheDocument();
    expect(screen.queryByText('768')).not.toBeInTheDocument();

    // The exact unattributed summary (persisted count/share).
    expect(
      screen.getByText('Unattributed · 146 orders (29%) have no referrer evidence.'),
    ).toBeInTheDocument();

    // The deterministic badges + the toolbar currency note.
    expect(screen.getAllByText('Deterministic')).toHaveLength(2);
    expect(
      screen.getByText('Reported in USD · native currency, no conversion applied'),
    ).toBeInTheDocument();

    // The statistical estimate renders in its own warning-treated card.
    expect(screen.getByText('Statistical estimate')).toBeInTheDocument();
    expect(screen.getByText('Model output')).toBeInTheDocument();
    expect(screen.getByText('$6,910.00')).toBeInTheDocument();
  });

  it('keeps ISO currency blocks separate (USD + EUR: no total, conversion, or shared delta)', async () => {
    const snapshot = makeSnapshot();
    const metrics = snapshot.metrics;
    metrics.deterministic.a1.push(
      methodRow('ga4_platform_attributed', 'EUR', {
        totals: metricSet({ currency: 'EUR', revenue: 1200.0, orders: 12 }),
      }),
    );
    metrics.deterministic.a2.push(
      methodRow('order_referrer', 'EUR', {
        totals: metricSet({ currency: 'EUR', revenue: 900.0, orders: 9 }),
      }),
    );
    metrics.deterministic.delta.push({
      currency: 'EUR',
      state: 'comparable',
      revenue: 300.0,
      orders: 3,
      average_order_value: null,
      conversion_rate: null,
    });
    useSnapshot(snapshot);
    renderWithProviders(<Harness />);

    // Two currency blocks → one full method card set per block.
    expect(await screen.findAllByText('A1 · GA4 platform-attributed')).toHaveLength(2);
    // One section heading per block; values render in their own currency.
    expect(screen.getByRole('heading', { name: 'USD' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'EUR' })).toBeInTheDocument();
    expect(screen.getAllByText('€1,200.00').length).toBeGreaterThan(0);
    expect(screen.getByText('+€300.00')).toBeInTheDocument();
    // No cross-currency total: 48,210 + 1,200 never appears.
    expect(screen.queryByText('$49,410.00')).not.toBeInTheDocument();
    expect(
      screen.getByText('Reported in native currencies · no conversion applied'),
    ).toBeInTheDocument();
  });

  it('shows the reduced-granularity alert only for the fallback state', async () => {
    const reduced = makeSnapshot();
    reduced.metrics.deterministic.a1[0]!.reduced_granularity = true;
    reduced.metrics.deterministic.a1[0]!.source_granularity = 'default_channel_group';
    useSnapshot(reduced);
    renderWithProviders(<Harness />);

    expect(
      await screen.findByText(
        /Reduced GA4 granularity · item revenue is grouped by default channel/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Reduced granularity')).toBeInTheDocument();
    expect(screen.getByText('Item × default channel')).toBeInTheDocument();
  });

  it('renders insufficient statistical data as the exact copy with all — estimates', async () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.statistical = {
      state: 'insufficient_data',
      sample_size: 31,
      allocations: [
        {
          ai_source: 'ChatGPT',
          currency: 'USD',
          estimated_revenue: null,
          estimated_orders: null,
          estimated_share: null,
        },
      ],
    };
    useSnapshot(snapshot);
    renderWithProviders(<Harness />);

    expect(
      await screen.findAllByText(/Insufficient data · no estimate is available for this window\./),
    ).not.toHaveLength(0);
    expect(
      screen.getByText(/Sample size 31 orders is below the reporting threshold\./),
    ).toBeInTheDocument();
    expect(screen.getByText('Insufficient data')).toBeInTheDocument();
    // Every estimate in the statistical table is — (never a fabricated 0).
    const card = screen.getByText('Statistical estimate').closest('div')!;
    expect(card.textContent).not.toContain('$0.00');
  });

  it('renders the empty contract as an honest empty state (no snapshot, not a 404)', async () => {
    useSnapshot({
      ...makeSnapshot(),
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
            window_start: '',
            window_end: '',
          },
        },
        statistical: { state: 'not_offered', sample_size: null, allocations: [] },
      },
      created_at: null,
    });
    renderWithProviders(<Harness />);

    expect(await screen.findByText('No attribution snapshot yet')).toBeInTheDocument();
    // not_offered: no statistical card anywhere.
    expect(screen.queryByText('Statistical estimate')).not.toBeInTheDocument();
  });

  it('renders the per-source deterministic table with each method in its own columns', async () => {
    const user = userEvent.setup();
    useSnapshot(makeSnapshot());
    renderWithProviders(<Harness />);

    await screen.findByText('A1 · GA4 platform-attributed');
    await user.click(screen.getByRole('tab', { name: 'By source' }));

    expect(screen.getByText('Revenue by AI source')).toBeInTheDocument();
    expect(screen.getByText('A1 revenue')).toBeInTheDocument();
    expect(screen.getByText('A2 AOV')).toBeInTheDocument();
    expect(screen.getAllByText('$21,430.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$18,220.00').length).toBeGreaterThan(0);
    expect(screen.getByText('184')).toBeInTheDocument();
    expect(screen.getByText('156')).toBeInTheDocument();
  });

  it('renders the per-SKU table with pagination and unresolved rows preserved', async () => {
    const user = userEvent.setup();
    const snapshot = makeSnapshot();
    // Add an unresolved A2-only row (product_id null) to prove it is kept.
    snapshot.metrics.deterministic.a2[0]!.by_product.push({
      product_id: null,
      sku: 'AC-SOCK-009',
      name: '',
      ai_source: 'chatgpt',
      source_label: 'ChatGPT',
      currency: 'USD',
      revenue: 740.0,
      orders: 12,
    });
    useSnapshot(snapshot);
    renderWithProviders(<Harness />);

    await screen.findByText('A1 · GA4 platform-attributed');
    await user.click(screen.getByRole('tab', { name: 'By product' }));

    expect(screen.getByText('Revenue by SKU')).toBeInTheDocument();
    expect(screen.getByText('Acme VoltBike 500')).toBeInTheDocument();
    expect(screen.getAllByText('$14,220.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$12,640.00').length).toBeGreaterThan(0);
    // Unresolved rows stay as plain SKU rows; the missing A1 side reads —.
    expect(screen.getByText('Unresolved catalog item')).toBeInTheDocument();
    expect(screen.getByText('Not matched to a catalog product')).toBeInTheDocument();
    // Two paired rows (A1/A2 of one SKU + the unresolved A2-only SKU); the
    // pagination label splits numerals into mono spans, so match the wrapper.
    expect(
      screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '1–2 of 2 products'),
    ).toBeInTheDocument();
  });

  it('labels reduced-granularity SKU rows as item groupings, never per-AI-source', async () => {
    const user = userEvent.setup();
    const reduced = makeSnapshot();
    reduced.metrics.deterministic.a1[0]!.reduced_granularity = true;
    reduced.metrics.deterministic.a1[0]!.source_granularity = 'default_channel_group';
    reduced.metrics.deterministic.a1[0]!.by_product[0]!.ai_source = null;
    reduced.metrics.deterministic.a1[0]!.by_product[0]!.source_label = 'Default channel: Referral';
    useSnapshot(reduced);
    renderWithProviders(<Harness />);

    await screen.findByText('A1 · GA4 platform-attributed');
    await user.click(screen.getByRole('tab', { name: 'By product' }));

    expect(screen.getByText('Item grouping')).toBeInTheDocument();
    expect(screen.getByText('Default channel: Referral')).toBeInTheDocument();
    expect(screen.queryByText('AI source')).not.toBeInTheDocument();
  });
});

describe('AttributionPanel recompute', () => {
  // Real timers on purpose: fake timers deadlock MSW's fetch resolution and
  // userEvent. The cadence assertions keep ~1s of slack on both sides of the
  // 3,000 ms poll boundary (ATTRIBUTION_RECOMPUTE_POLL_MS).
  it('posts once, polls the task every 3s, stops at terminal, and refetches the snapshot', async () => {
    const counters = { snapshot: 0, post: 0, task: 0 };
    useSnapshot(makeSnapshot(), counters);
    mswServer.use(
      http.post(RECOMPUTE_URL, () => {
        counters.post += 1;
        return HttpResponse.json(
          {
            task_id: TASK,
            project_id: PROJECT,
            status: 'queued',
            error_code: '',
            updated_at: '2026-07-24T06:12:00Z',
            completed_at: null,
          },
          { status: 202 },
        );
      }),
      http.get(TASK_URL, () => {
        counters.task += 1;
        return HttpResponse.json({
          task_id: TASK,
          project_id: PROJECT,
          status: counters.task === 1 ? 'running' : 'succeeded',
          error_code: '',
          updated_at: '2026-07-24T06:12:00Z',
          completed_at: counters.task === 1 ? null : '2026-07-24T06:15:00Z',
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    // Initial snapshot load; no recompute yet.
    expect(await screen.findByText('A1 · GA4 platform-attributed')).toBeInTheDocument();
    expect(counters.snapshot).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Recompute' }));

    // One POST; the first task fetch arrives promptly, still non-terminal.
    await waitFor(() => expect(counters.post).toBe(1));
    await waitFor(() => expect(counters.task).toBe(1));
    expect(await screen.findByText('Recomputing…')).toBeInTheDocument();

    // 3s cadence: no second poll well before the boundary, then it fires.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2_000);
    });
    expect(counters.task).toBe(1);
    await waitFor(() => expect(counters.task).toBe(2), { timeout: 2_500 });

    // Terminal success: the snapshot namespace refetches, polling stops.
    await waitFor(() => expect(counters.snapshot).toBe(2));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 3_500);
    });
    expect(counters.task).toBe(2);
    expect(counters.post).toBe(1);
    // The button is armed again once the task is terminal.
    expect(screen.getByRole('button', { name: 'Recompute' })).toBeEnabled();
  }, 15_000);

  it('keeps the snapshot and shows the explicit failure when the task fails', async () => {
    const counters = { snapshot: 0 };
    useSnapshot(makeSnapshot(), counters);
    mswServer.use(
      http.post(RECOMPUTE_URL, () =>
        HttpResponse.json(
          {
            task_id: TASK,
            project_id: PROJECT,
            status: 'queued',
            error_code: '',
            updated_at: '2026-07-24T06:12:00Z',
            completed_at: null,
          },
          { status: 202 },
        ),
      ),
      http.get(TASK_URL, () =>
        HttpResponse.json({
          task_id: TASK,
          project_id: PROJECT,
          status: 'failed',
          error_code: 'GA4_SYNC_FAILED',
          updated_at: '2026-07-24T06:12:00Z',
          completed_at: '2026-07-24T06:15:00Z',
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await screen.findByText('A1 · GA4 platform-attributed');
    await user.click(screen.getByRole('button', { name: 'Recompute' }));

    await screen.findByText(/The attribution recompute failed/);
    expect(screen.getByText(/GA4_SYNC_FAILED/)).toBeInTheDocument();
    // The current snapshot stays on screen (no invalidation on failure).
    expect(screen.getByText('$48,210.00')).toBeInTheDocument();
    // A failed task persists nothing, so the snapshot namespace never
    // refetches — wait past a poll tick to prove no invalidation fired.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    expect(counters.snapshot).toBe(1);
  });
});
