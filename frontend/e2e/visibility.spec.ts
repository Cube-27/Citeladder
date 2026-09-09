import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * F9 four-tab Visibility workspace e2e (Task 4).
 *
 * All backend calls are stubbed at the network layer so the spec runs without a
 * live backend (mirrors `runs.spec.ts`). It asserts the four-tab IA — exactly
 * Trends, Mentions & Citations, Query Fanout (no Overview / Sources / Topics /
 * Sentiment) — the WAI-ARIA tablist (pointer + keyboard navigation, one panel at
 * a time, `?tab=` URL sync), shared-filter persistence across tabs, the evidence
 * populated / empty / error states, the three Query Fanout query states, and a
 * narrow-viewport (mobile) layout check.
 *
 * The app calls only relative `/api/v1` paths (Next rewrites proxy them), so the
 * spec asserts every `/api/` request the browser issues is same-origin with the
 * page's baseURL — no cross-origin backend URL.
 */
const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const AUDIT_LATEST = '22222222-2222-4222-8222-222222222222';
const AUDIT_EARLIER = '22222222-2222-4222-8222-222222222221';
const ANALYSIS_A = '44444444-4444-4444-8444-444444444444';
const ANALYSIS_B = '55555555-5555-4555-8555-555555555555';
const ANALYSIS_C = '66666666-6666-4666-8666-666666666666';
const PROMPT_A = '77777777-7777-4777-8777-777777777777';
const SNAP_A = '88888888-8888-4888-8888-888888888888';
const TASK_A = '99999999-9999-4999-8999-999999999999';
const ARTIFACT_A = 'abababab-abab-4bab-8bab-abababababab';

const user = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'visibility@example.com',
  role: 'owner',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const project = {
  id: PROJECT_ID,
  workspace_id: WORKSPACE_ID,
  name: 'CiteLadder',
  brand_name: 'Acme',
  website_url: 'https://acme.com',
  industry: 'general',
  subindustry: '',
  primary_market: 'United States',
  country_code: 'US',
  language_code: 'en',
  benchmark_mode: 'consumer_like',
  default_repetitions: 3,
  brand: { aliases: [] },
  owned_domains: [],
  unintended_domains: [],
  competitors: [],
  prompt_sets: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const audit = {
  id: AUDIT_LATEST,
  workspace_id: WORKSPACE_ID,
  project_id: PROJECT_ID,
  status: 'completed',
  benchmark_mode: 'consumer_like',
  repetitions: 2,
  random_seed: '1',
  requested_count: 6,
  completed_count: 6,
  failed_count: 0,
  error_message: '',
  engine_snapshots: [],
  created_at: '2026-07-15T00:00:00Z',
  updated_at: '2026-07-15T00:00:00Z',
  started_at: '2026-07-15T00:00:00Z',
  completed_at: '2026-07-15T00:00:00Z',
};

function visibility(score: number) {
  return {
    project_id: PROJECT_ID,
    audit_id: AUDIT_LATEST,
    audit_status: 'completed',
    analyzer_version: 'v1',
    scoring_rule_version: 'v1',
    total_completed: 6,
    total_failed: 0,
    visibility_score: score,
    visibility_rate: 4 / 6,
    owned_citation_rate: 2 / 6,
    counts: {
      state: 'measured',
      responses: 6,
      brand_responses: 4,
      owned_citation_responses: 2,
      entity_presences: 6,
      expected: 6,
      failed: 0,
      not_run: 0,
    },
    model_provenance: [],
    rankings: [
      {
        name: 'Acme',
        is_brand: true,
        mention_rate: score / 100,
        citation_rate: 0.3,
        share_of_voice: 0.6,
        mention_count: 4,
        sentiment: null,
        avg_position: null,
      },
      {
        name: 'Globex',
        gap_count: 2,
        is_brand: false,
        mention_rate: 0.3,
        citation_rate: 0.1,
        share_of_voice: 0.4,
        mention_count: 2,
        sentiment: null,
        avg_position: null,
      },
    ],
    per_engine: [
      {
        logical_engine: 'gemini',
        total_completed: 3,
        brand_mention_rate: 0.6,
        owned_citation_rate: 0.3,
        search_use_rate: 0.5,
        visibility_score: 60,
      },
      {
        logical_engine: 'claude',
        total_completed: 3,
        brand_mention_rate: 0.7,
        owned_citation_rate: 0.4,
        search_use_rate: 0.6,
        visibility_score: 70,
      },
    ],
    sentiment: null,
    avg_position: null,
    created_at: '2026-07-15T00:00:00Z',
  };
}

function trendPoint(auditId: string, completedAt: string, score: number | null) {
  return {
    audit_id: auditId,
    completed_at: completedAt,
    logical_engine: null,
    visibility_score: score,
    brand_mention_rate: 0.5,
    owned_citation_rate: 0.3,
    sov: { response: 0.4, mention: 0.5 },
    rankings: [
      {
        name: 'Acme',
        is_brand: true,
        mention_rate: 0.5,
        citation_rate: 0.3,
        share_of_voice: 0.6,
        mention_count: 4,
        sentiment: null,
        avg_position: null,
      },
    ],
    sentiment: null,
    avg_position: null,
    source_snapshot_ids: [auditId],
    comparison_key: 'same-panel',
    analyzer_versions: ['v1'],
    scoring_rule_versions: ['v1'],
    spans_version_boundary: false,
  };
}

function citation(ordinal: number) {
  return {
    ordinal,
    url: 'https://acme.com/blog',
    title: 'Acme Blog',
    domain: 'acme.com',
    classification: 'owned',
    is_owned: true,
    is_unintended: false,
    matched_competitor: null,
  };
}

function evidenceItem(overrides: Record<string, unknown> = {}) {
  return {
    audit_id: AUDIT_LATEST,
    task_id: TASK_A,
    analysis_id: ANALYSIS_A,
    artifact_id: ARTIFACT_A,
    prompt_snapshot_id: SNAP_A,
    prompt_id: PROMPT_A,
    prompt_index: 3,
    prompt_text: 'Best affordable clothing stores in Australia?',
    repetition: 1,
    completed_at: '2026-07-15T14:32:00Z',
    logical_engine: 'chatgpt',
    transport_provider: 'openai',
    transport_model: 'gpt-5.4',
    search_used: true,
    search_query_count: 2,
    query_text_available: true,
    state: 'queries_available',
    search_events: [
      {
        sequence: 0,
        query: 'affordable family clothing Australia 2026',
        call_id: 'c1',
        call_sequence: 0,
        query_sequence: 0,
      },
      {
        sequence: 1,
        query: 'best budget clothing shops families',
        call_id: 'c1',
        call_sequence: 0,
        query_sequence: 1,
      },
    ],
    event_source: 'raw_artifact',
    mentions: [
      { kind: 'brand', name: 'Acme', first_offset: 12, artifact_id: null, analyzer_version: 'v1' },
      {
        kind: 'competitor',
        name: 'Globex',
        first_offset: null,
        artifact_id: null,
        analyzer_version: 'v1',
      },
    ],
    citations: [citation(1)],
    ...overrides,
  };
}

/** Fixture with all three Query Fanout states present. */
function fanoutStatesResponse() {
  return {
    items: [
      evidenceItem(),
      evidenceItem({
        analysis_id: ANALYSIS_B,
        logical_engine: 'claude',
        transport_model: 'claude-sonnet-4-6',
        state: 'count_only',
        query_text_available: false,
        search_query_count: 1,
        search_events: [],
        event_source: 'audit_task',
        artifact_id: null,
        mentions: [],
        citations: [],
      }),
      evidenceItem({
        analysis_id: ANALYSIS_C,
        prompt_index: 2,
        logical_engine: 'gemini',
        transport_model: 'gemini-flash-latest',
        state: 'no_search',
        search_used: false,
        search_query_count: 0,
        query_text_available: false,
        search_events: [],
        event_source: 'none',
        mentions: [],
        citations: [],
      }),
    ],
    truncated: false,
  };
}

type RouteBodies = {
  visibility?: unknown;
  visibilityStatus?: number;
  trends?: unknown;
  trendsStatus?: number;
  evidence?: unknown;
  evidenceStatus?: number;
};

/**
 * Register the shared network stubs. Every backend call is a relative
 * `/api/v1` path so the same-origin assertion holds. Returns the collected
 * request log and a helper to read the evidence request query params.
 */
async function setup(page: Page, bodies: RouteBodies = {}) {
  const requests: Request[] = [];
  const evidenceUrls: URL[] = [];
  page.on('request', (request) => requests.push(request));

  // 404 catch-all FIRST (Playwright matches in reverse registration order, so
  // the specific stubs below still win). Without it, an unstubbed downstream
  // query (entitlements, GettingStartedCard's audits) falls through to a live
  // backend, 401s, and the session guard bounces to /login. 4xx never retries
  // (lib/api/query-client.ts), so unstubbed queries settle in one attempt.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'e2e fixture: endpoint not stubbed' }),
    }),
  );

  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user } }));
  await page.route('**/api/v1/projects', (route) => route.fulfill({ json: [project] }));
  // The visibility dashboard lists audits via the flat `/audits?project_id=` route.
  await page.route('**/api/v1/audits**', (route) =>
    route.fulfill({
      json: [audit, { ...audit, id: AUDIT_EARLIER, completed_at: '2026-07-08T00:00:00Z' }],
    }),
  );

  // Precise regexes so `/visibility`, `/visibility/trends`, and
  // `/visibility/evidence` (all carrying `?...` query strings) route distinctly.
  await page.route(/\/api\/v1\/projects\/[^/]+\/visibility(\?.*)?$/, (route) =>
    route.fulfill(
      bodies.visibilityStatus
        ? { status: bodies.visibilityStatus, json: { detail: 'boom' } }
        : {
            json: bodies.visibility ?? {
              ...visibility(67),
              audit_id: new URL(route.request().url()).searchParams.get('audit_id') ?? AUDIT_LATEST,
            },
          },
    ),
  );
  await page.route(/\/api\/v1\/projects\/[^/]+\/visibility\/trends(\?.*)?$/, (route) =>
    route.fulfill(
      bodies.trendsStatus
        ? { status: bodies.trendsStatus, json: { detail: 'boom' } }
        : {
            json: bodies.trends ?? [
              trendPoint(AUDIT_EARLIER, '2026-07-08T00:00:00Z', 54),
              trendPoint(AUDIT_LATEST, '2026-07-15T00:00:00Z', 67),
            ],
          },
    ),
  );
  await page.route(/\/api\/v1\/projects\/[^/]+\/visibility\/evidence(\?.*)?$/, (route) => {
    evidenceUrls.push(new URL(route.request().url()));
    return route.fulfill(
      bodies.evidenceStatus
        ? { status: bodies.evidenceStatus, json: { detail: 'boom' } }
        : { json: bodies.evidence ?? { items: [evidenceItem()], truncated: false } },
    );
  });

  await page.route(/\/api\/v1\/projects\/[^/]+\/visibility\/sources(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        items: [],
        total: 0,
        responses: 6,
        prompts: 2,
        next_offset: null,
        as_of: '2026-07-15T00:00:00Z',
        comparison_status: 'no_baseline',
      },
    }),
  );
  await page.route(/\/api\/v1\/projects\/[^/]+\/visibility\/fanout(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        items: [],
        answers: [],
        total_answers: 0,
        event_count: 2,
        distinct_queries: 2,
        coverage: { queries_available: 1 },
        next_offset: null,
      },
    }),
  );
  await page.route(/\/api\/v1\/projects\/[^/]+\/visibility\/prompts(\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  return { requests, evidenceUrls };
}

/** Assert every observed `/api/` request is same-origin with the baseURL. */
function assertSameOriginApi(requests: Request[], baseURL: string) {
  const origin = new URL(baseURL).origin;
  const apiRequests = requests.filter((r) => new URL(r.url()).pathname.includes('/api/'));
  expect(apiRequests.length).toBeGreaterThan(0);
  for (const request of apiRequests) {
    expect(new URL(request.url()).origin).toBe(origin);
  }
}

test('pointer navigation switches panels and syncs ?tab=', async ({ page, baseURL }) => {
  const { requests, evidenceUrls } = await setup(page, { evidence: fanoutStatesResponse() });
  await page.goto('/visibility');

  await expect(page.getByText('Measurement history', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  // Mentions & Citations.
  await page.getByRole('tab', { name: 'Mentions & Citations' }).click();
  await expect(page).toHaveURL(/[?&]tab=mentions-citations/);
  await page.getByRole('button', { name: 'Mentions and citations mode' }).click();
  await page.getByRole('menuitemradio', { name: 'Answers', exact: true }).click();
  await expect(page.getByText('Best affordable clothing stores in Australia?')).toBeVisible();
  await expect(page.getByText('Acme Blog')).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  // Query Fanout — reuses the shared evidence cache.
  await page.getByRole('tab', { name: 'Query Fanout' }).click();
  await expect(page).toHaveURL(/[?&]tab=query-fanout/);
  await expect(page.getByText('affordable family clothing Australia 2026')).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  expect(evidenceUrls.length).toBeGreaterThan(0);
  assertSameOriginApi(requests, baseURL!);
});

test('keyboard navigation moves selection with focus transfer (WAI-ARIA)', async ({ page }) => {
  await setup(page, { trends: [] });
  await page.goto('/visibility');

  const trends = page.getByRole('tab', { name: 'Trends' });
  await expect(trends).toHaveAttribute('aria-selected', 'true');
  await trends.focus();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Mentions & Citations' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Mentions & Citations' })).toBeFocused();

  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Query Fanout' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: 'Query Fanout' })).toBeFocused();

  // Wraps forward from the last tab back to the first.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Trends' })).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Query Fanout' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Mentions & Citations' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Trends' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Trends' })).toBeFocused();
});

test('mobile viewport keeps the visibility tabs and one active panel usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await setup(page);
  await page.goto('/visibility');

  const tablist = page.getByRole('tablist', { name: 'Visibility views' });
  await expect(tablist).toBeVisible();
  const selectedTab = tablist.getByRole('tab', { selected: true });
  await expect(selectedTab).toBeVisible();

  // All three retained tabs are still present in the one row.
  await expect(tablist.getByRole('tab')).toHaveCount(3);

  // Inactive panels are NOT stacked — still exactly one panel in the DOM.
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  // Shared filters remain usable: the engine dropdown still opens + selects.
  await page.getByRole('button', { name: 'Filter by model' }).click();
  await page.getByRole('menuitemradio', { name: 'Gemini' }).click();
  await expect(page.getByRole('button', { name: 'Filter by model' })).toContainText('Gemini');
});

for (const width of [1280, 375]) {
  test(`older run and engine preserve context through gap evidence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { evidenceUrls } = await setup(page);
    await page.goto(`/visibility?run=${AUDIT_EARLIER}&engine=gemini`);
    await page.getByRole('button', { name: '2 brand-absent answers' }).click();
    await expect(page.getByRole('link', { name: 'Open answer', exact: true })).toBeVisible();
    const evidenceUrl = evidenceUrls.at(-1)!;
    expect(evidenceUrl.searchParams.get('audit_id')).toBe(AUDIT_EARLIER);
    expect(evidenceUrl.searchParams.get('engine')).toBe('gemini');
    expect(evidenceUrl.searchParams.get('outcome')).toBe('competitor_gap');
    await expect(page.getByRole('link', { name: 'Open answer', exact: true })).toHaveAttribute(
      'href',
      `/runs/${AUDIT_LATEST}?execution=${TASK_A}`,
    );
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`run=${AUDIT_EARLIER}.*engine=gemini`));
    await expect(page.getByRole('button', { name: '2 brand-absent answers' })).toBeVisible();
    await page.screenshot({ path: `test-results/visibility-${width}.png`, fullPage: true });
  });
}
