/**
 * The selection reads moved in PR 9b over HTTP: the dashboard, prompt
 * scores, trends, query fanout, the Sources table and per-answer evidence.
 *
 * Ported from the Python suites these routes left
 * (`test_analysis_api_trends.py`, `test_visibility_fanout_projection.py`,
 * `test_analysis_api_evidence.py`, `test_analysis_http.py`), against the
 * real PostgreSQL schema, with workspace isolation on every route.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Json, type Tenant } from './visibility-fixtures.ts';
import { compareSelection } from '../src/visibility/comparison.ts';
import { record } from '../src/db/json.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new VisibilityFixtures(db);
const app = createApp(config, db);

type Body = Record<string, unknown>;
type Row = Record<string, unknown>;

async function get(
  tenant: Tenant,
  path: string,
  query: Record<string, string | string[]> = {},
): Promise<{ status: number; body: Body & Row[] }> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of [value].flat()) search.append(key, item);
  }
  const token = await sessionToken({ sub: tenant.userId, ver: 0 });
  const response = await app.request(`${path}${search.size ? `?${search}` : ''}`, {
    headers: { cookie: `${config.session.cookieName}=${token}` },
  });
  return { status: response.status, body: (await response.json()) as Body & Row[] };
}

const route = (tenant: Tenant, suffix = '') =>
  `/api/v1/projects/${tenant.projectId}/visibility${suffix}`;

/** A frozen configuration complete enough to carry a comparison identity. */
function frozen(overrides: Record<string, unknown> = {}): Json {
  return {
    brand_name: 'Acme Corp',
    brand_aliases: [],
    owned_domains: ['acme.example'],
    competitors: [{ name: 'Globex', aliases: [], domains: ['globex.example'] }],
    country_code: 'US',
    language_code: 'en',
    benchmark_mode: 'standard',
    panel_hash: 'panel-1',
    engine_routes: {
      chatgpt: { transport_provider: 'test', transport_model: 'model-a', retrieval_enabled: true },
    },
    measurement_policy: {
      retrieval_enabled: true,
      max_output_tokens: 1000,
      answer_instruction: '',
    },
    ...overrides,
  } as Json;
}

/** One run's stored aggregate: `brand` and `globex` answers out of `completed`. */
function aggregate(input: {
  completed: number;
  brand: number;
  owned?: number;
  globex?: number;
  expected?: number;
}): Record<string, unknown> {
  const { completed, brand, owned = 0, globex = 0 } = input;
  return {
    total_completed: completed,
    brand_mention_count: brand,
    owned_citation_response_count: owned,
    brand_mention_rate: brand / completed,
    owned_citation_rate: owned / completed,
    competitor_mention_rate: { Globex: globex / completed },
    competitor_citation_rate: { Globex: 0 },
    share_of_voice: { mention_counts: { 'Acme Corp': brand, Globex: globex } },
    coverage: { requested: input.expected ?? completed, failed: 0, not_run: 0 },
    per_prompt: [{ composite_score: 60 }, { composite_score: 40 }],
  };
}

async function measuredRun(
  tenant: Tenant,
  completedAt: string,
  metrics: Record<string, unknown>,
  options: { visibilityScore?: number; analyzerVersion?: string; configuration?: Json } = {},
): Promise<string> {
  const auditId = await fixtures.audit(tenant, {
    completedAt: new Date(completedAt),
    configuration: options.configuration ?? frozen(),
  });
  await fixtures.metricSnapshot(tenant, auditId, {
    metrics: { ...metrics, per_engine: { chatgpt: metrics } } as Json,
    visibilityScore: options.visibilityScore,
    analyzerVersion: options.analyzerVersion,
  });
  return auditId;
}

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

it('measures the baseline walk over 100 runs with alternating frozen routes (B21)', async () => {
  const tenant = await fixtures.tenant();
  const metrics = aggregate({ completed: 2, brand: 1 });
  const ids: string[] = [];
  let currentConfiguration: Json = {};
  for (let index = 0; index < 100; index++) {
    currentConfiguration = {
      ...frozen(),
      engine_routes: {
        chatgpt: {
          transport_provider: 'test',
          transport_model: index % 2 ? 'model-b' : 'model-a',
        },
      },
    };
    ids.push(
      await measuredRun(
        tenant,
        new Date(Date.UTC(2026, 0, 1) + index * 86400000).toISOString(),
        metrics,
        { configuration: currentConfiguration },
      ),
    );
  }
  let cellQueries = 0;
  const counted = db.withPlugin({
    transformQuery({ node }) {
      const selections = record(node).selections;
      if (
        Array.isArray(selections) &&
        selections.some(
          (selection) =>
            record(record(record(selection).selection).column).column &&
            record(record(record(record(selection).selection).column).column).name ===
              'request_snapshot',
        )
      )
        cellQueries++;
      return node;
    },
    transformResult: async ({ result }) => result,
  });
  const comparison = await compareSelection(
    counted,
    tenant,
    {
      auditId: ids[99]!,
      workspaceId: tenant.workspaceId,
      configuration: currentConfiguration,
      completedAt: new Date(Date.UTC(2026, 0, 1) + 99 * 86400000).toISOString().replace(/Z$/u, ''),
      analyzerVersion: 'test',
      scoringRuleVersion: 'test',
      metrics,
    },
    { cohort: 'core', engine: null, baselineId: null },
  );
  console.info(`B21: 100 alternating-route runs, loadComparisonCells calls = ${cellQueries}`);
  expect(comparison).toMatchObject({ baseline_audit_id: ids[97], skipped_runs: 1 });
  expect(cellQueries).toBeLessThan(10);
});

describe('workspace isolation', () => {
  it('answers every moved read for a foreign project as not found', async () => {
    const tenant = await fixtures.tenant();
    const outsider = await fixtures.tenant();
    for (const suffix of ['', '/prompts', '/trends', '/fanout', '/sources', '/evidence']) {
      const { status, body } = await get(outsider, route(tenant, suffix));
      expect([suffix, status, body.detail]).toEqual([suffix, 404, 'Project not found']);
    }
  });
});

describe('GET /visibility', () => {
  let tenant: Tenant;
  let baseline: string;
  let latest: string;

  beforeAll(async () => {
    tenant = await fixtures.tenant();
    await fixtures.brand(tenant.projectId, 'Acme Corp', true);
    await fixtures.competitor(tenant.projectId, { name: 'Globex', domains: ['globex.example'] });
    baseline = await measuredRun(
      tenant,
      '2026-03-01T00:00:00Z',
      aggregate({ completed: 4, brand: 2, owned: 1, globex: 2 }),
    );
    latest = await measuredRun(
      tenant,
      '2026-03-08T00:00:00Z',
      {
        ...aggregate({ completed: 4, brand: 3, owned: 2, globex: 1 }),
        comparison: aggregate({ completed: 2, brand: 2 }),
      },
      { visibilityScore: 70 },
    );
    // One answer in the latest run named Globex and not the brand: a gap.
    await fixtures.execution(tenant, {
      auditId: latest,
      analysis: { brandMentioned: false, competitorMentions: ['Globex'] },
    });
  });

  it('projects the latest run against its nearest compatible baseline', async () => {
    const { status, body } = await get(tenant, route(tenant));

    expect(status).toBe(200);
    expect(body).toMatchObject({
      audit_id: latest,
      selection_mode: 'latest',
      visibility_rate: 0.75,
      owned_citation_rate: 0.5,
      // The stored composite and the prompt composite stay separate measures.
      visibility_score: 70,
      prompt_performance_score: 50,
      counts: { responses: 4, brand_responses: 3, expected: 4 },
    });
    expect(body.comparison).toMatchObject({
      status: 'comparable',
      baseline_audit_id: baseline,
      baseline_at: '2026-03-01T00:00:00Z',
      deltas: { visibility: 25, owned_citation: 25 },
    });
    const [brand, globex] = body.rankings as Row[];
    expect(brand).toMatchObject({
      name: 'Acme Corp',
      is_brand: true,
      share_of_voice: 0.75,
      logo_url: `/api/v1/projects/${tenant.projectId}/logo`,
      website_url: 'https://acme.example',
      visibility_delta: 25,
      gap_count: null,
    });
    expect(globex).toMatchObject({
      name: 'Globex',
      website_url: 'https://globex.example',
      gap_count: 1,
    });
  });

  it("reads a cohort's own aggregate, and a single engine's slice has no stored score", async () => {
    const comparison = await get(tenant, route(tenant), { cohort: 'comparison' });
    expect(comparison.body).toMatchObject({ cohort: 'comparison', visibility_rate: 1 });

    const engine = await get(tenant, route(tenant), { engine: 'chatgpt' });
    expect(engine.body).toMatchObject({ visibility_score: null, visibility_rate: 0.75 });
    expect((engine.body.per_engine as Row[]).map((row) => row.logical_engine)).toEqual(['chatgpt']);
  });

  it('is a 404 with nothing measured, and a run selection needs its run', async () => {
    const empty = await fixtures.tenant();
    const missing = await get(empty, route(empty));
    expect([missing.status, missing.body.detail]).toEqual([
      404,
      'No visibility metrics available for the selected measurement',
    ]);
    expect((await get(tenant, route(tenant), { selection_mode: 'run' })).status).toBe(422);
    expect((await get(tenant, route(tenant), { engine: 'altavista' })).status).toBe(422);
  });

  it('pools one configuration over a period and compares the period before it', async () => {
    const pooled = await fixtures.tenant();
    const before = await measuredRun(
      pooled,
      '2026-03-28T00:00:00Z',
      aggregate({ completed: 4, brand: 1 }),
    );
    const first = await measuredRun(
      pooled,
      '2026-04-02T00:00:00Z',
      aggregate({ completed: 4, brand: 2 }),
    );
    const second = await measuredRun(
      pooled,
      '2026-04-05T00:00:00Z',
      aggregate({ completed: 4, brand: 4 }),
    );

    const { status, body } = await get(pooled, route(pooled), {
      selection_mode: 'range',
      from: '2026-04-01T00:00:00Z',
      to: '2026-04-08T00:00:00Z',
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      selection_mode: 'range',
      audit_id: second,
      source_audit_ids: [first, second],
      from_at: '2026-04-01T00:00:00Z',
      visibility_rate: 0.75,
      visibility_score: null,
      coverage: { requested: 8, completed: 8, rate: 1 },
    });
    expect(body.comparison).toMatchObject({
      status: 'comparable',
      baseline_audit_ids: [before],
      baseline_at: '2026-03-25T00:00:00Z',
      deltas: { visibility: 50 },
    });
  });
});

describe('GET /visibility/trends', () => {
  it('folds a week, weighting each rate by the responses behind it', async () => {
    const tenant = await fixtures.tenant();
    const monday = await measuredRun(
      tenant,
      '2026-03-02T09:00:00Z',
      aggregate({ completed: 4, brand: 2 }),
    );
    const wednesday = await measuredRun(
      tenant,
      '2026-03-04T09:00:00Z',
      aggregate({ completed: 2, brand: 2 }),
    );

    const raw = await get(tenant, route(tenant, '/trends'));
    expect(raw.body.map((point) => point.audit_id)).toEqual([monday, wednesday]);

    const weekly = await get(tenant, route(tenant, '/trends'), { granularity: 'week' });
    expect(weekly.body).toHaveLength(1);
    expect(weekly.body[0]).toMatchObject({
      audit_id: null,
      completed_at: '2026-03-02T00:00:00Z',
      run_count: 2,
      source_audit_ids: [monday, wednesday],
      counts: { responses: 6, brand_responses: 4 },
      spans_version_boundary: false,
    });
    expect(weekly.body[0]!.visibility_rate).toBeCloseTo(4 / 6);

    // Neither run measured this engine, so neither emits a point.
    expect((await get(tenant, route(tenant, '/trends'), { engine: 'claude' })).body).toEqual([]);
    const invalid = await get(tenant, route(tenant, '/trends'), { granularity: 'hour' });
    expect([invalid.status, invalid.body.detail]).toEqual([422, 'Unsupported granularity: hour']);
  });

  it('folds each analyzer version into its own point, never one blend', async () => {
    const tenant = await fixtures.tenant();
    await measuredRun(tenant, '2026-03-02T09:00:00Z', aggregate({ completed: 4, brand: 2 }), {
      analyzerVersion: 'v1',
    });
    await measuredRun(tenant, '2026-03-03T09:00:00Z', aggregate({ completed: 4, brand: 2 }), {
      analyzerVersion: 'v2',
    });

    const { body } = await get(tenant, route(tenant, '/trends'), { granularity: 'week' });
    expect(body.map((point) => [point.run_count, point.analyzer_versions])).toEqual([
      [1, ['v1']],
      [1, ['v2']],
    ]);
    expect(body.some((point) => point.spans_version_boundary)).toBe(false);
  });

  it('slices by frozen retrieval state before folding', async () => {
    const tenant = await fixtures.tenant();
    await measuredRun(tenant, '2026-03-02T09:00:00Z', aggregate({ completed: 4, brand: 2 }));
    const off = await measuredRun(
      tenant,
      '2026-03-03T09:00:00Z',
      aggregate({ completed: 4, brand: 2 }),
      {
        configuration: frozen({
          measurement_policy: {
            retrieval_enabled: false,
            max_output_tokens: 1000,
            answer_instruction: '',
          },
        }),
      },
    );

    const { body } = await get(tenant, route(tenant, '/trends'), { retrieval_enabled: 'false' });
    expect(body.map((point) => point.audit_id)).toEqual([off]);
  });
});

describe('GET /visibility/prompts', () => {
  it("orders prompts by score and counts each route against that route's own tasks", async () => {
    const tenant = await fixtures.tenant();
    const auditId = await fixtures.audit(tenant, { configuration: frozen() });
    const best = { auditId, promptIndex: 0, promptText: 'best crm' };
    await fixtures.execution(tenant, {
      ...best,
      engine: 'chatgpt',
      transportModel: 'model-a',
      analysis: { brandMentioned: true, avgPosition: 1 },
    });
    await fixtures.execution(tenant, {
      ...best,
      engine: 'claude',
      transportModel: 'model-b',
      analysis: { brandMentioned: false, score: { competitors_mentioned: ['Globex'] } },
    });
    await fixtures.execution(tenant, {
      ...best,
      engine: 'gemini',
      transportModel: 'model-a',
      taskStatus: 'failed',
      analysis: null,
    });
    await fixtures.execution(tenant, { auditId, promptIndex: 1, promptText: 'cheap crm' });
    await fixtures.promptScore(tenant, auditId, {
      promptIndex: 0,
      promptText: 'best crm',
      composite: 40,
    });
    await fixtures.promptScore(tenant, auditId, {
      promptIndex: 1,
      promptText: 'cheap crm',
      composite: 80,
    });

    const { status, body } = await get(tenant, route(tenant, '/prompts'), { audit_id: auditId });

    expect(status).toBe(200);
    expect(body.map((item) => item.prompt_text)).toEqual(['cheap crm', 'best crm']);
    const scored = body[1]!;
    expect(scored).toMatchObject({
      counts: { responses: 2, expected: 3, failed: 1, not_run: 0, brand_responses: 1 },
      visibility_rate: 0.5,
      avg_position: 1,
      comparison_status: 'no_baseline',
    });
    expect(scored.outcomes).toEqual([
      expect.objectContaining({
        logical_engine: 'chatgpt',
        transport_model: 'model-a',
        counts: expect.objectContaining({ expected: 1, brand_responses: 1 }),
      }),
      expect.objectContaining({
        logical_engine: 'claude',
        gap_counts: { Globex: 1 },
      }),
    ]);

    const foreignRun = await get(tenant, route(tenant, '/prompts'), { audit_id: randomUUID() });
    expect([foreignRun.status, foreignRun.body.detail]).toEqual([404, 'Audit not found']);
    // Only a brand run has prompt scores to read.
    const crawl = await fixtures.audit(tenant, { scope: 'site_health' });
    expect((await get(tenant, route(tenant, '/prompts'), { audit_id: crawl })).status).toBe(404);
  });

  it('pools a prompt across a period and drops every single-run score', async () => {
    const tenant = await fixtures.tenant();
    const runs = [];
    for (const [day, brand] of [
      ['2026-03-02', true],
      ['2026-03-09', false],
    ] as const) {
      const auditId = await fixtures.audit(tenant, { completedAt: new Date(`${day}T00:00:00Z`) });
      await fixtures.execution(tenant, {
        auditId,
        promptIndex: 0,
        promptText: 'best crm',
        analysis: { brandMentioned: brand },
      });
      await fixtures.promptScore(tenant, auditId, {
        promptIndex: 0,
        promptText: 'best crm',
        composite: 50,
      });
      runs.push(auditId);
    }

    const { body } = await get(tenant, route(tenant, '/prompts'), { audit_ids: runs });

    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      source_audit_ids: [...runs].sort(),
      composite_score: null,
      rolling_four: [],
      counts: { responses: 2, brand_responses: 1 },
      visibility_rate: 0.5,
    });
  });
});

describe('GET /visibility/fanout and /visibility/evidence', () => {
  let tenant: Tenant;
  let auditId: string;
  let pricingTask: string;
  let artifactTask: string;

  beforeAll(async () => {
    tenant = await fixtures.tenant();
    auditId = await fixtures.audit(tenant);
    const at = (minute: number) => new Date(`2026-03-01T10:${String(minute).padStart(2, '0')}:00Z`);
    pricingTask = (
      await fixtures.execution(tenant, {
        auditId,
        engine: 'chatgpt',
        taskEvents: [{ query: 'Best CRM' }, { query: 'crm pricing' }, {}],
        analysis: { brandMentioned: true, createdAt: at(1), brandMentions: ['Acme Corp'] },
      })
    ).taskId;
    // The immutable artifact's events win over the task's copy.
    artifactTask = (
      await fixtures.execution(tenant, {
        auditId,
        engine: 'claude',
        taskEvents: [{ query: 'ignored' }],
        artifactEvents: [{ query: 'best crm', sequence: '2' }],
        analysis: {
          createdAt: at(2),
          competitorMentions: ['Globex'],
          citations: [{ url: 'https://globex.example/x', matched: 'Globex' }],
        },
      })
    ).taskId;
    await fixtures.execution(tenant, {
      auditId,
      engine: 'gemini',
      analysis: { createdAt: at(3), searchUsed: true, searchQueryCount: 2 },
    });
    await fixtures.execution(tenant, {
      auditId,
      engine: 'chatgpt_search',
      providerMetadata: { fanout_availability: 'unavailable' },
      analysis: { createdAt: at(4) },
    });
  });

  it('totals the whole selection whatever the search or page', async () => {
    const all = await get(tenant, route(tenant, '/fanout'), { audit_id: auditId });
    expect(all.body).toMatchObject({
      event_count: 3,
      distinct_queries: 3,
      matched_queries: 3,
      coverage: { queries_available: 2, count_only: 1, unavailable: 1 },
    });

    const searched = await get(tenant, route(tenant, '/fanout'), {
      audit_id: auditId,
      search: 'BEST',
      limit: '1',
    });
    expect(searched.body).toMatchObject({
      distinct_queries: 3,
      matched_queries: 2,
    });
    expect(searched.body.items as Row[]).toHaveLength(1);
    expect(searched.body.next_cursor).toEqual(expect.any(String));
    const next = await get(tenant, route(tenant, '/fanout'), {
      audit_id: auditId,
      search: 'BEST',
      limit: '1',
      cursor: searched.body.next_cursor as string,
    });
    expect(next.body).toMatchObject({
      event_count: 3,
      distinct_queries: 3,
      matched_queries: 2,
      next_cursor: null,
    });
    expect((next.body.items as Row[])[0]!.query).not.toBe((searched.body.items as Row[])[0]!.query);
    expect(
      (
        await get(tenant, route(tenant, '/fanout'), {
          audit_id: auditId,
          search: 'pricing',
          cursor: searched.body.next_cursor as string,
        })
      ).status,
    ).toBe(422);

    const drilled = await get(tenant, route(tenant, '/fanout'), {
      audit_id: auditId,
      query: 'crm pricing',
    });
    expect(drilled.body).toMatchObject({ total_answers: 1, answers: [{ task_id: pricingTask }] });
  });

  it('pools persisted queries across runs, retaining duplicates and paging each answer once', async () => {
    const pooled = await fixtures.tenant();
    const runs: string[] = [];
    const tasks: string[] = [];
    for (let index = 0; index < 2; index++) {
      const run = await fixtures.audit(pooled);
      runs.push(run);
      const execution = await fixtures.execution(pooled, {
        auditId: run,
        artifactEvents: [{ query: '  crm  ' }, { query: 'crm' }, { sequence: 3 }],
        analysis: { brandMentioned: index === 0 },
      });
      tasks.push(execution.taskId);
    }
    const first = await get(pooled, route(pooled, '/fanout'), {
      audit_ids: runs,
      query: 'crm',
      limit: '1',
    });
    expect(first.body).toMatchObject({
      event_count: 6,
      distinct_queries: 1,
      total_answers: 2,
      coverage: { queries_available: 2 },
      items: [{ query: 'crm', event_count: 4, response_count: 2, brand_response_count: 1 }],
    });
    const next = await get(pooled, route(pooled, '/fanout'), {
      audit_ids: runs,
      query: 'crm',
      limit: '1',
      cursor: first.body.next_cursor as string,
    });
    expect(next.body).toMatchObject({ event_count: 6, total_answers: 2, next_cursor: null });
    expect(
      [...(first.body.answers as Row[]), ...(next.body.answers as Row[])]
        .map((row) => row.task_id)
        .sort(),
    ).toEqual(tasks.sort());
  });

  it('serves normalized evidence newest first, one keyset page at a time', async () => {
    const first = await get(tenant, route(tenant, '/evidence'), {
      audit_id: auditId,
      limit: '2',
    });
    expect(first.body).toMatchObject({ total: 4, truncated: true });
    const items = first.body.items as Row[];
    expect(items.map((item) => item.logical_engine)).toEqual(['chatgpt_search', 'gemini']);
    expect(items.map((item) => item.state)).toEqual(['unavailable', 'count_only']);

    const second = await get(tenant, route(tenant, '/evidence'), {
      audit_id: auditId,
      limit: '2',
      cursor: first.body.next_cursor as string,
      as_of: first.body.as_of as string,
    });
    const [claude, chatgpt] = second.body.items as Row[];
    expect(second.body.total).toBe(4);
    expect(second.body.truncated).toBe(false);
    expect(claude).toMatchObject({
      task_id: artifactTask,
      event_source: 'raw_artifact',
      search_events: [{ query: 'best crm', sequence: 2 }],
      mentions: [{ kind: 'competitor', name: 'Globex' }],
      citations: [{ url: 'https://globex.example/x', matched_competitor: 'Globex' }],
    });
    // The malformed `{}` entry is not an event.
    expect(chatgpt).toMatchObject({ event_source: 'audit_task', state: 'queries_available' });
    expect(chatgpt!.search_events as Row[]).toHaveLength(2);

    const moved = await get(tenant, route(tenant, '/evidence'), {
      audit_id: auditId,
      limit: '2',
      cursor: first.body.next_cursor as string,
    });
    expect([moved.status, moved.body.detail]).toEqual([
      422,
      'Invalid evidence cursor for this selection',
    ]);
  });

  it('filters by outcome and competitor, and a gap needs its competitor', async () => {
    const gaps = await get(tenant, route(tenant, '/evidence'), {
      audit_id: auditId,
      outcome: 'competitor_gap',
      competitor: 'Globex',
    });
    expect((gaps.body.items as Row[]).map((item) => item.task_id)).toEqual([artifactTask]);
    expect(
      (await get(tenant, route(tenant, '/evidence'), { outcome: 'competitor_gap' })).status,
    ).toBe(422);
  });
});

describe('GET /visibility/sources', () => {
  it('pages a multi-run selection in both directions with stable totals and bound filters', async () => {
    const tenant = await fixtures.tenant();
    const runs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const auditId = await fixtures.audit(tenant);
      runs.push(auditId);
      await fixtures.execution(tenant, {
        auditId,
        analysis: {
          citations: [
            { url: 'https://a.example/1', sourceClass: 'news' },
            { url: `https://${i ? 'c' : 'b'}.example/1`, sourceClass: 'news' },
          ],
        },
      });
    }
    const first = await get(tenant, route(tenant, '/sources'), { audit_ids: runs, limit: '1' });
    expect(first.body).toMatchObject({
      total: 3,
      responses: 2,
      total_citations: 4,
      category_totals: { news: 4 },
      previous_cursor: null,
      items: [{ key: 'a.example', responses: 2 }],
    });
    const second = await get(tenant, route(tenant, '/sources'), {
      audit_ids: [...runs].reverse(),
      limit: '1',
      cursor: first.body.next_cursor as string,
    });
    expect(second.body).toMatchObject({
      total: 3,
      responses: 2,
      total_citations: 4,
      category_totals: { news: 4 },
      items: [{ key: 'b.example' }],
    });
    const last = await get(tenant, route(tenant, '/sources'), {
      audit_ids: runs,
      limit: '1',
      cursor: second.body.next_cursor as string,
    });
    expect(last.body).toMatchObject({ next_cursor: null, items: [{ key: 'c.example' }] });
    const back = await get(tenant, route(tenant, '/sources'), {
      audit_ids: runs,
      limit: '1',
      cursor: last.body.previous_cursor as string,
    });
    expect(back.body.items).toEqual(second.body.items);
    const start = await get(tenant, route(tenant, '/sources'), {
      audit_ids: runs,
      limit: '1',
      cursor: back.body.previous_cursor as string,
    });
    expect(start.body).toMatchObject({ previous_cursor: null, items: first.body.items });
    expect(
      (
        await get(tenant, route(tenant, '/sources'), {
          audit_ids: runs,
          limit: '1',
          domain: 'a.example',
          cursor: first.body.next_cursor as string,
        })
      ).status,
    ).toBe(422);
  });
  it('counts domains, then pages with their page record and co-named brands', async () => {
    const tenant = await fixtures.tenant();
    const auditId = await fixtures.audit(tenant);
    await fixtures.execution(tenant, {
      auditId,
      analysis: {
        brandMentions: ['Acme Corp'],
        citations: [
          { url: 'https://example.com/a', urlHash: 'hash-a' },
          { url: 'https://example.com/b' },
        ],
      },
    });
    await fixtures.execution(tenant, {
      auditId,
      analysis: {
        citations: [
          { url: 'https://example.com/a', urlHash: 'hash-a' },
          { url: 'https://other.com/x', sourceClass: 'news' },
        ],
      },
    });
    const action = randomUUID();
    await fixtures.sourcePage(tenant, { urlHash: 'hash-a', url: 'https://example.com/a', action });

    const domains = await get(tenant, route(tenant, '/sources'), { audit_id: auditId });
    expect(domains.body).toMatchObject({
      total: 2,
      responses: 2,
      total_citations: 4,
      category_totals: { news: 1 },
    });
    expect(
      (domains.body.items as Row[]).map((row) => [row.key, row.response_rate, row.last_cited_at]),
    ).toEqual([
      ['example.com', 1, null],
      ['other.com', 0.5, null],
    ]);

    const pages = await get(tenant, route(tenant, '/sources'), {
      audit_id: auditId,
      domain: 'example.com',
    });
    const [page] = pages.body.items as Row[];
    expect(page).toMatchObject({
      key: 'https://example.com/a',
      url_hash: 'hash-a',
      inspection_state: 'inspected',
      opportunity_id: action,
      page_format: 'article',
      retrieval_rate: null,
      mentions: 1,
      brands: [{ kind: 'brand', name: 'Acme Corp', responses: 1 }],
    });
    expect(page!.last_cited_at).toEqual(expect.any(String));

    const naive = await get(tenant, route(tenant, '/sources'), { as_of: '2026-03-01T00:00:00' });
    expect([naive.status, naive.body.detail]).toEqual([422, "'as_of' must be timezone-aware"]);
  });

  it("moves each row's response rate against a complete, earlier baseline set", async () => {
    const tenant = await fixtures.tenant();
    const complete = aggregate({ completed: 1, brand: 0 });
    const baseline = await measuredRun(tenant, '2026-02-01T00:00:00Z', complete);
    await fixtures.execution(tenant, {
      auditId: baseline,
      analysis: { citations: [{ url: 'https://example.com/a' }] },
    });
    const current = await measuredRun(tenant, '2026-03-01T00:00:00Z', complete);
    await fixtures.execution(tenant, {
      auditId: current,
      analysis: { citations: [{ url: 'https://other.com/x' }] },
    });

    const { body } = await get(tenant, route(tenant, '/sources'), {
      audit_ids: [current],
      baseline_audit_ids: [baseline],
    });

    expect(body.comparison_status).toBe('comparable');
    expect((body.items as Row[]).map((row) => [row.key, row.response_delta])).toEqual([
      ['other.com', 100],
    ]);
  });
});
