import { describe, expect, it } from 'vitest';
import { modelView } from '../src/agent/tool-views.ts';
import { answerExcerpt } from '../src/mcp/evidence-analytics.ts';

const audit = '00000000-0000-4000-8000-000000000001';
const task = '00000000-0000-4000-8000-000000000002';
const prompt = '00000000-0000-4000-8000-000000000003';
const ref = { kind: 'audit', id: audit, record_uri: `citeladder://audit/${audit}` };

describe('the Agent view of a read', () => {
  it('drops nested provenance and shows each full-list overview section as counts and a short top list', () => {
    const prompts = Array.from({ length: 7 }, (_, index) => ({
      id: `p${index}`,
      text: `Prompt ${index}`,
      topic: 'Nets',
      record_uri: `citeladder://prompt/p${index}`,
    }));
    expect(
      modelView('get_project_business_context', {
        project: { id: 'project', website_url: 'https://acme.example' },
        visibility: {
          state: 'available',
          score: 40,
          source_audit_ids: [audit],
          artifact_refs: [ref],
        },
        prompts: {
          state: 'available',
          topics: [{ id: 't', name: 'Nets', description: '' }],
          topics_truncated: false,
          items: prompts,
          pagination: { returned_count: 7, has_more: true, next_cursor: 'c' },
        },
        actions: {
          state: 'available',
          status_counts: { open: 1 },
          items: [
            {
              id: 'a1',
              target_label: 'Pricing',
              status: 'open',
              priority_band: 'high',
              summary: 'Fix it',
              goal: { kind: 'x' },
            },
          ],
          pagination: { has_more: false },
          artifact_refs: [ref],
        },
        referrals: {
          state: 'available',
          window: { start: '2026-09-01', end: '2026-09-30' },
          referral_share: 0.1,
          referral_volume: [{ date: '2026-09-01', sessions: 3 }],
          sources: [{ ai_source: 'chatgpt', sessions: 3 }],
          landing_pages: [{ canonical_url: 'https://acme.example/', ai_source: 'chatgpt' }],
          landing_page_count: 1,
        },
        demand: { state: 'unavailable', reason: 'no_demand_snapshot' },
      }),
    ).toEqual({
      project: { id: 'project', website_url: 'https://acme.example' },
      visibility: { state: 'available', score: 40 },
      prompts: {
        state: 'available',
        topics_truncated: false,
        prompt_count: 7,
        more_prompts: true,
        topic_count: 1,
        top_prompts: prompts.slice(0, 5).map(({ id, text, topic }) => ({ id, text, topic })),
      },
      actions: {
        state: 'available',
        status_counts: { open: 1 },
        more_actions: false,
        top_actions: [
          {
            id: 'a1',
            target_label: 'Pricing',
            status: 'open',
            priority_band: 'high',
            summary: 'Fix it',
          },
        ],
      },
      referrals: {
        state: 'available',
        window: { start: '2026-09-01', end: '2026-09-30' },
        referral_share: 0.1,
        landing_page_count: 1,
        top_sources: [{ ai_source: 'chatgpt', sessions: 3 }],
        top_landing_pages: [{ canonical_url: 'https://acme.example/', ai_source: 'chatgpt' }],
      },
      demand: { state: 'unavailable', reason: 'no_demand_snapshot' },
    });
  });

  it('reduces an answer to what it said, keeping the ids the model passes back and the fetch id', () => {
    const view = modelView('read_visibility_results', {
      state: 'available',
      audit_id: audit,
      items: [
        {
          audit_id: audit,
          task_id: task,
          prompt_id: prompt,
          prompt_index: 0,
          prompt_text: 'best golf nets',
          repetition: 1,
          completed_at: '2026-09-01T00:00:00Z',
          logical_engine: 'chatgpt',
          transport_provider: 'openai',
          transport_model: 'gpt',
          retrieval_enabled: true,
          search_used: true,
          search_query_count: 1,
          query_text_available: true,
          state: 'queries_available',
          event_source: 'raw_artifact',
          search_events: [
            { sequence: 0, query: 'golf nets', call_id: 'c', call_sequence: 0, query_sequence: 0 },
          ],
          mentions: [
            {
              kind: 'brand',
              name: 'Acme',
              logo_url: 'https://logo',
              website_url: 'https://acme.example',
              first_offset: 0,
              artifact_id: null,
              analyzer_version: 'v1',
            },
          ],
          citations: [
            {
              ordinal: 1,
              url: 'https://review.example/a',
              title: 'Review',
              domain: 'review.example',
              classification: 'third_party',
              source_class: 'review',
              source_origin: 'model',
              source_taxonomy_version: 't1',
              is_owned: false,
              is_unintended: false,
              matched_competitor: null,
            },
          ],
          answer_excerpt: 'Acme makes nets.',
          record_uri: `citeladder://visibility_result/${task}`,
        },
      ],
      artifact_refs: [ref],
    });
    expect(view).toEqual({
      state: 'available',
      audit_id: audit,
      items: [
        {
          task_id: task,
          prompt_id: prompt,
          prompt_text: 'best golf nets',
          logical_engine: 'chatgpt',
          transport_model: 'gpt',
          repetition: 1,
          completed_at: '2026-09-01T00:00:00Z',
          search_used: true,
          queries: ['golf nets'],
          mentions: [{ kind: 'brand', name: 'Acme' }],
          citations: [
            {
              url: 'https://review.example/a',
              title: 'Review',
              domain: 'review.example',
              classification: 'third_party',
              matched_competitor: null,
            },
          ],
          answer_excerpt: 'Acme makes nets.',
          record_uri: `citeladder://visibility_result/${task}`,
        },
      ],
    });
  });

  it('keeps a trend point to its headline, the comparison key and a short ranking per brand', () => {
    const view = modelView('read_visibility_trends', {
      state: 'available',
      points: [
        {
          audit_id: audit,
          completed_at: '2026-09-01T00:00:00Z',
          visibility_score: 41.23456,
          comparison_key: 'k1',
          source_audit_ids: [audit],
          source_snapshot_ids: [task],
          analyzer_versions: ['v1'],
          scoring_rule_versions: ['s1'],
          model_provenance: [{ engine: 'chatgpt' }],
          spans_version_boundary: false,
          rankings: [
            {
              name: 'Acme',
              is_brand: true,
              logo_url: 'https://logo',
              website_url: 'https://acme.example',
              mention_rate: 0.33333,
              citation_rate: 0.1,
              share_of_voice: 0.5,
              mention_count: 3,
              gap_count: null,
              avg_position: 1.5,
              win_rate: 0.66666,
              sentiment: { net: 10 },
            },
          ],
          events: [],
        },
      ],
    });
    expect(view).toEqual({
      state: 'available',
      points: [
        {
          audit_id: audit,
          completed_at: '2026-09-01T00:00:00Z',
          visibility_score: 41.235,
          comparison_key: 'k1',
          spans_version_boundary: false,
          rankings: [
            {
              name: 'Acme',
              is_brand: true,
              mention_rate: 0.333,
              citation_rate: 0.1,
              share_of_voice: 0.5,
              avg_position: 1.5,
              win_rate: 0.667,
            },
          ],
          events: [],
        },
      ],
    });
  });

  it('folds a page timeline into citations per day and drops its row ids', () => {
    expect(
      modelView('read_ai_traffic_url', {
        state: 'available',
        crawls: [{ bot_id: 'gptbot', requests: 4, source_rollup_ids: [task, prompt] }],
        referrals: [{ ai_source: 'chatgpt', sessions: 2, source_metric_row_ids: [task] }],
        citations: [
          { date: '2026-09-01', citation_id: 'c1', audit_id: audit },
          { date: '2026-09-01', citation_id: 'c2', audit_id: audit },
          { date: '2026-09-02', citation_id: 'c3', audit_id: audit },
        ],
      }),
    ).toEqual({
      state: 'available',
      crawls: [{ bot_id: 'gptbot', requests: 4 }],
      referrals: [{ ai_source: 'chatgpt', sessions: 2 }],
      citations: [
        { date: '2026-09-01', citations: 2 },
        { date: '2026-09-02', citations: 1 },
      ],
    });
  });

  it('caps perception quotes and prompts and strips quote ids, keeping trend versions', () => {
    const quote = (text: string) => ({
      text,
      theme: 'price',
      attribute: { kind: 'labelled', name: 'cheap' },
      polarity: 'positive',
      entity: 'Acme',
      is_brand: true,
      logical_engine: 'chatgpt',
      prompt: 'best nets',
      run_id: audit,
      execution_id: task,
      observed_at: '2026-09-01T00:00:00Z',
      extractor_version: 'e1',
      template_version: 't1',
    });
    const shown = (text: string) => ({
      text,
      theme: 'price',
      attribute: { kind: 'labelled', name: 'cheap' },
      polarity: 'positive',
      entity: 'Acme',
      logical_engine: 'chatgpt',
      prompt: 'best nets',
    });
    const breakdown = (net: number) => ({
      key: `k${net}`,
      label: `P${net}`,
      score: { net_sentiment: net },
    });
    const entity = {
      name: 'Acme',
      is_brand: true,
      logo_url: 'https://logo',
      categories: [
        {
          category: 'value',
          attributes: [{ attribute: 'cheap', quotes: ['a', 'b', 'c'].map(quote) }],
        },
      ],
    };
    const trend = [
      { audit_id: audit, extractor_version: 'e1', template_version: 't1', comparable: true },
    ];
    const view = modelView('read_perception', {
      state: 'available',
      view: 'summary',
      source_audit_ids: [audit],
      brand: entity,
      entities: [entity],
      themes: [{ theme: 'price', quotes: ['a', 'b', 'c'].map(quote) }],
      negative_quotes: [quote('n')],
      prompts: Array.from({ length: 25 }, (_, index) => breakdown(index - 12)),
      trend,
    });
    const shownEntity = {
      name: 'Acme',
      is_brand: true,
      categories: [
        {
          category: 'value',
          attributes: [{ attribute: 'cheap', quotes: [shown('a'), shown('b')] }],
        },
      ],
    };
    expect(view).toEqual({
      state: 'available',
      view: 'summary',
      brand: shownEntity,
      entities: [shownEntity],
      themes: [{ theme: 'price', quotes: [shown('a'), shown('b')] }],
      negative_quotes: [shown('n')],
      prompts: [
        ...Array.from({ length: 10 }, (_, index) => breakdown(index - 12)),
        ...Array.from({ length: 10 }, (_, index) => breakdown(index + 3)),
      ],
      prompt_count: 25,
      trend,
    });
  });

  it('shows a prompt as its score, rates and leading brands', () => {
    const view = modelView('read_prompt_metrics', {
      state: 'available',
      view: 'list',
      audit_id: audit,
      items: [
        {
          id: task,
          audit_id: audit,
          prompt_id: prompt,
          prompt_text: 'best nets',
          prompt_snapshot_id: task,
          theme: 'Nets',
          composite_score: 52.123456,
          previous_score: 50,
          immediate_delta: 2.123456,
          rolling_four: [52, 50],
          components: { visibility: 0.5 },
          analyzer_version: 'v1',
          scoring_rule_version: 's1',
          created_at: '2026-09-01T00:00:00Z',
          visibility_rate: 0.5,
          win_rate: null,
          brands: ['Acme', 'Rival', 'Other', 'Fourth'].map((name) => ({
            kind: 'competitor',
            name,
            responses: 1,
            logo_url: null,
            website: null,
          })),
          comparison: {
            status: 'comparable',
            deltas: { visibility: 5 },
            rankings: [],
            current_rankings: [],
          },
          record_uri: `citeladder://prompt/${prompt}`,
        },
      ],
      pagination: { has_more: false },
    });
    expect(view).toEqual({
      state: 'available',
      view: 'list',
      audit_id: audit,
      items: [
        {
          prompt_id: prompt,
          prompt_text: 'best nets',
          theme: 'Nets',
          composite_score: 52.123,
          previous_score: 50,
          immediate_delta: 2.123,
          visibility_rate: 0.5,
          win_rate: null,
          brands: ['Acme', 'Rival', 'Other'],
          comparison: { status: 'comparable', deltas: { visibility: 5 } },
        },
      ],
      pagination: { has_more: false },
    });
  });

  it('drops raw request ids and fetch ids the model cannot use, per tool', () => {
    const request = {
      id: task,
      source_id: task,
      batch_id: task,
      url_hash: 'h',
      display_path: '/a',
      catalog_version: 'c1',
      verification: 'verified',
      verification_reason: 'r',
      verification_basis: 'b',
      ip_range_snapshot_id: task,
      bot_id: 'gptbot',
    };
    expect(modelView('read_crawl_logs', { state: 'available', items: [request] })).toEqual({
      state: 'available',
      items: [{ id: task, display_path: '/a', verification: 'verified', bot_id: 'gptbot' }],
    });
    const row = { id: prompt, text: 'best nets', record_uri: `citeladder://prompt/${prompt}` };
    expect(modelView('read_prompt_portfolio', { items: [row] })).toEqual({
      items: [{ id: prompt, text: 'best nets' }],
    });
    expect(modelView('read_actions', { items: [row] })).toEqual({ items: [row] });
  });

  it('hands a complete fetched record over as an object and leaves a part as text', () => {
    const record = {
      id: task,
      rule_id: 'title',
      source_artifact_ids: [audit],
      evaluations: [
        { id: 'e', outcome: 'fail', supporting_artifact_ids: [audit], rule_version: 'r1' },
      ],
    };
    const document = (text: string, complete: boolean) => ({
      id: `citeladder://site_page/${task}`,
      title: 'Pricing',
      text,
      url: 'https://app/x',
      metadata: { complete },
    });
    expect(modelView('fetch', document(JSON.stringify(record), true))).toEqual({
      id: `citeladder://site_page/${task}`,
      title: 'Pricing',
      url: 'https://app/x',
      metadata: { complete: true },
      record: {
        id: task,
        rule_id: 'title',
        evaluations: [{ id: 'e', outcome: 'fail', rule_version: 'r1' }],
      },
    });
    expect(modelView('fetch', document('{"id":', false))).toEqual(document('{"id":', false));
  });
});

describe('an answer excerpt', () => {
  it('opens a few characters before the brand and marks the cut ends', () => {
    const text = `${'a'.repeat(30)}Acme${'b'.repeat(30)}`;
    expect(answerExcerpt(text, 30, 20)).toBe(`…aaaaaAcme${'b'.repeat(11)}…`);
    expect(answerExcerpt('Acme is short.', 0, 20)).toBe('Acme is short.');
    expect(answerExcerpt('', 0, 20)).toBeNull();
  });
});
