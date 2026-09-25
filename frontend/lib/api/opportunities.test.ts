import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { opportunitiesApi, opportunitiesQueries } from './opportunities';
import { queryKeys } from './query-keys';
import {
  opportunitiesPageSchema,
  opportunityDetailSchema,
  opportunitySchema,
  opportunitySeveritySchema,
  opportunitySummarySchema,
  opportunityTypeSchema,
} from './schemas/opportunities';
import { strictValidate } from './schemas/validation';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPP = '22222222-2222-4222-8222-222222222222';
const AUDIT = '33333333-3333-4333-8333-333333333333';
const CRAWL = '44444444-4444-4444-8444-444444444444';

const emptySourceMix = {
  state: 'not_applicable' as const,
  projection_version: 'opportunity-source-mix-1',
  taxonomy_version: 'source-taxonomy-2',
  counts: {},
  percentages: {},
  observation_count: 0,
  answers_with_sources: 0,
  eligible_analyzed_answers: 0,
  coverage_rate: null,
  limitations: [],
};

const item = {
  id: OPP,
  project_id: PROJECT,
  rule_id: 'brand_absent_high_value_prompt',
  opportunity_type: 'visibility' as const,
  severity: 'high' as const,
  priority_score: 120,
  title: 'Brand absent from high-value prompt',
  target_key: `prompt:${OPP}`,
  target_prompt_id: OPP,
  target_url: null,
  target_theme: 'crm',
  target_label: 'best crm for small teams',
  action_id: '66666666-6666-4666-8666-666666666666',
  system_rank: 1,
  display_rank: 1,
  order_source: 'system' as const,
  priority_factors: { severity_weight: 40, evidence_weight: 20 },
  evidence_summary: { count: 2, kinds: ['response_analysis', 'metric_snapshot'] },
  created_at: '2026-07-24T00:00:00Z',
  updated_at: '2026-07-24T00:00:00Z',
};

const detail = {
  ...item,
  remediation: 'Publish a comparison page.',
  evidence: { prompt_text: 'best crm for small teams', competitor_names: ['Globex'] },
  source_analysis_ids: [AUDIT],
  source_issue_ids: [],
  source_metric_ids: [AUDIT],
  source_traffic_ids: [],
  analyzer_version: 'opp-analyzer-1',
  rule_version: 'opp-rules-1',
  formula_version: 'opp-formula-1',
  content_handoff: {
    opportunity_id: OPP,
    pathway: 'owned' as const,
    source_class: null,
    canonical_domain: null,
    suggested_role: 'Content',
    suggested_skill_id: 'comparison',
    target_url: null,
    target_theme: 'crm',
    representative_citations: [],
    affected_prompt_indices: [],
    affected_themes: ['crm'],
    observed_competitors: ['Globex'],
    coverage: {},
    limitations: [],
    truncated: false,
    source_analysis_ids: [AUDIT],
    snapshot_versions: { analyzer_version: 'opp-analyzer-1' },
  },
  superseded_by_id: null,
  superseded_at: null,
};

const summary = {
  activation_state: 'ready',
  computed: true,
  run_id: AUDIT,
  audit_id: AUDIT,
  site_crawl_id: CRAWL,
  demand_snapshot_id: null,
  demand_source_revision: null,
  coverage: { crawl_status: 'completed' },
  limitations: [],
  source_mix: emptySourceMix,
  action_path_mix: emptySourceMix,
  domain_rollups: [],
  counts_by_type: { site: 2, topic: 0, traffic: 0, visibility: 2 },
  counts_by_severity: { critical: 0, high: 1, info: 0, low: 1, medium: 2 },
  total_count: 4,
  median_priority: 50,
  analyzer_version: 'opp-analyzer-1',
  rule_version: 'opp-rules-1',
  formula_version: 'opp-formula-1',
  computed_at: '2026-07-24T00:00:00Z',
  evidence_updated_at: '2026-07-23T00:00:00Z',
  stale: false,
};

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('opportunity schemas (strictValidate drift policy)', () => {
  it('accepts a valid catalog row', () => {
    expect(strictValidate(opportunitySchema, item, 'test')).toEqual(item);
    expect(strictValidate(opportunityDetailSchema, detail, 'test')).toEqual(detail);
    expect(
      strictValidate(opportunitiesPageSchema, { items: [item], next_cursor: null }, 'test'),
    ).toEqual({ items: [item], next_cursor: null });
    expect(strictValidate(opportunitySummarySchema, summary, 'test')).toEqual(summary);
  });

  it('accepts the pre-recompute summary (computed=false, nulls)', () => {
    const empty = {
      ...summary,
      activation_state: 'waiting_for_evidence',
      computed: false,
      run_id: null,
      audit_id: null,
      site_crawl_id: null,
      demand_snapshot_id: null,
      demand_source_revision: null,
      counts_by_type: {},
      counts_by_severity: {},
      total_count: 0,
      median_priority: null,
      computed_at: null,
      evidence_updated_at: null,
      stale: false,
    };
    expect(strictValidate(opportunitySummarySchema, empty, 'test')).toEqual(empty);
  });

  it('preserves an available three-way source mix', () => {
    const available = {
      ...emptySourceMix,
      state: 'available' as const,
      counts: { earned: 2, owned: 1, competitive_evidence: 1 },
      percentages: { earned: 50, owned: 25, competitive_evidence: 25 },
      observation_count: 4,
      answers_with_sources: 3,
      eligible_analyzed_answers: 4,
      coverage_rate: 0.75,
    };
    const parsed = strictValidate(
      opportunitySummarySchema,
      { ...summary, source_mix: available },
      'test',
    );
    expect(parsed.source_mix).toEqual(available);
  });

  it('carries the backend-owned target_label on items and details (C1)', () => {
    const parsedItem = strictValidate(opportunitySchema, item, 'test');
    expect(parsedItem.target_label).toBe('best crm for small teams');
    const parsedDetail = strictValidate(opportunityDetailSchema, detail, 'test');
    expect(parsedDetail.target_label).toBe('best crm for small teams');
    // A missing declared label fails loud (contract drift), null is valid.
    expect(() =>
      strictValidate(
        opportunitySchema,
        { ...item, target_label: undefined } as unknown as typeof item,
        'test',
      ),
    ).toThrow(/API validation failure/);
    expect(
      strictValidate(opportunitySchema, { ...item, target_label: null }, 'test').target_label,
    ).toBeNull();
  });

  it('fails loud on declared-field drift: bad enums, non-uuid ids', () => {
    expect(() =>
      strictValidate(opportunitySchema, { ...item, severity: 'urgent' }, 'test'),
    ).toThrow(/API validation failure/);
    expect(() =>
      strictValidate(opportunitySchema, { ...item, action_id: 'not-a-uuid' }, 'test'),
    ).toThrow(/API validation failure/);
    expect(() =>
      strictValidate(opportunitySchema, { ...item, opportunity_type: 'brand' }, 'test'),
    ).toThrow(/API validation failure/);
    expect(() => strictValidate(opportunitySchema, { ...item, id: 'not-a-uuid' }, 'test')).toThrow(
      /API validation failure/,
    );
  });

  it('strips additive keys (tolerant-on-unknown)', () => {
    const parsedItem = strictValidate(opportunitySchema, { ...item, unexpected: true }, 'test');
    expect('unexpected' in parsedItem).toBe(false);
    const parsedSummary = strictValidate(
      opportunitySummarySchema,
      { ...summary, extra: 1 },
      'test',
    );
    expect('extra' in parsedSummary).toBe(false);
  });

  it('exposes the full vocabulary enums', () => {
    expect(opportunityTypeSchema.options).toEqual([
      'visibility',
      'commerce',
      'site',
      'traffic',
      'topic',
    ]);
    expect(opportunitySeveritySchema.options).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ]);
  });
});

describe('opportunitiesApi transport', () => {
  it('builds the list query string from params', async () => {
    const seen: string[] = [];
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/opportunities`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ items: [item], next_cursor: null });
      }),
    );

    const page = await opportunitiesApi.list(PROJECT, {
      type: 'site',
      severity: 'medium',
      status: 'open',
      rule_id: 'thin_content',
      min_priority: 30,
      limit: 25,
      cursor: 'abc',
    });
    expect(page.items).toHaveLength(1);
    expect(seen).toHaveLength(1);
    const params = new URLSearchParams(seen[0]);
    expect(params.get('type')).toBe('site');
    expect(params.get('severity')).toBe('medium');
    expect(params.get('status')).toBe('open');
    expect(params.get('rule_id')).toBe('thin_content');
    expect(params.get('min_priority')).toBe('30');
    expect(params.get('limit')).toBe('25');
    expect(params.get('cursor')).toBe('abc');
  });

  it('omits undefined params from the query string', async () => {
    const seen: string[] = [];
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/opportunities`, ({ request }) => {
        seen.push(new URL(request.url).search);
        return HttpResponse.json({ items: [], next_cursor: null });
      }),
    );
    await opportunitiesApi.list(PROJECT);
    expect(seen[0]).toBe('');
  });

  it('gets the detail', async () => {
    mswServer.use(http.get(`/api/v1/opportunities/${OPP}`, () => HttpResponse.json(detail)));
    expect((await opportunitiesApi.get(OPP)).rule_id).toBe('brand_absent_high_value_prompt');
  });

  it('strips an additive key when the wire shape drifts (tolerant-on-unknown)', async () => {
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/opportunities/summary`, () =>
        HttpResponse.json({ ...summary, extra: 'drift' }),
      ),
    );
    const result = await opportunitiesApi.summary(PROJECT);
    expect('extra' in result).toBe(false);
  });
});

describe('opportunity query keys', () => {
  it('isolates namespaces by project / id / filters', () => {
    expect(queryKeys.opportunities.all).toEqual(['opportunities']);
    expect(queryKeys.opportunities.list(PROJECT, { severity: 'high' })).toEqual([
      'opportunities',
      'list',
      PROJECT,
      { severity: 'high' },
    ]);
    expect(queryKeys.opportunities.detail(OPP)).toEqual(['opportunities', 'detail', OPP]);
    expect(queryKeys.opportunities.summary(PROJECT)).toEqual(['opportunities', 'summary', PROJECT]);
  });

  it('separates owned and earned action paths for identical filters', () => {
    const owned = opportunitiesQueries.list(WORKSPACE, PROJECT, {
      severity: 'high',
      action_path: 'owned',
    });
    const earned = opportunitiesQueries.list(WORKSPACE, PROJECT, {
      severity: 'high',
      action_path: 'earned',
    });
    expect(owned.queryKey).not.toEqual(earned.queryKey);
    expect(owned.queryKey.at(-1)).toMatchObject({ action_path: 'owned' });
    expect(earned.queryKey.at(-1)).toMatchObject({ action_path: 'earned' });
  });
});
