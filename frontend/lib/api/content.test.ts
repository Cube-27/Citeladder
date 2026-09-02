import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  CONTENT_DETAIL_POLL_MS,
  CONTENT_LIST_DEFAULT_LIMIT,
  CONTENT_LIST_POLL_MS,
  contentApi,
} from './content';
import { queryKeys } from './query-keys';
import {
  contentGenerationDetailSchema,
  contentGenerationListItemSchema,
  strictValidate,
} from './schemas';
import { mswServer } from '@/test/msw-server';

const GENERATION_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

const listItem = {
  id: GENERATION_ID,
  project_id: PROJECT_ID,
  status: 'queued' as const,
  skill_id: 'article' as const,
  opportunity_id: null,
  context_status: 'included' as const,
  requested_model: 'mistral-small-latest',
  returned_model: null,
  provider: 'mistral',
  created_at: '2026-07-15T00:00:00Z',
  updated_at: '2026-07-15T00:00:00Z',
  completed_at: null,
  error_code: '',
  instruction_preview: 'Write a landing page',
};

const detail = {
  ...listItem,
  skill_version: 1,
  feedback: null,
  feedback_reason: '',
  feedback_at: null,
  user_instruction: 'Write a landing page for Acme.',
  context_summary: {
    version: 'content-context-v1',
    crawl_page_count: 3,
    crawl_urls: ['https://acme.test/', 'https://acme.test/pricing', 'https://acme.test/about'],
    crawl_completed_at: '2026-07-15T00:00:00Z',
    brand_memory: true,
    brand_fields: ['description'],
    target_url: null,
    issue_count: 0,
    related_page_count: 3,
    omissions: [],
  },
  finish_reason: null,
  output_truncated: false,
  output_text: null,
  usage: null,
  latency_ms: null,
  error_detail: '',
  generator_version: 'content-v3',
};

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('content generation API', () => {
  it('lists a bounded projection without output bodies', async () => {
    let seenUrl = '';
    mswServer.use(
      http.get('/api/v1/content/generations', ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([{ ...listItem, output_text: 'must not reach state' }]);
      }),
    );

    const items = await contentApi.listGenerations(PROJECT_ID);
    expect(items).toHaveLength(1);
    expect(items[0].instruction_preview).toBe('Write a landing page');
    expect('output_text' in items[0]).toBe(false);
    expect(new URL(seenUrl).searchParams).toMatchObject({
      get: expect.any(Function),
    });
    expect(new URL(seenUrl).searchParams.get('project_id')).toBe(PROJECT_ID);
    expect(new URL(seenUrl).searchParams.get('limit')).toBe(String(CONTENT_LIST_DEFAULT_LIMIT));
  });

  it('enqueues mandatory website-grounded input and preserves idempotency', async () => {
    let key: string | null = null;
    let body: unknown;
    mswServer.use(
      http.post('/api/v1/content/generations', async ({ request }) => {
        key = request.headers.get('idempotency-key');
        body = await request.json();
        return HttpResponse.json(detail, { status: 201 });
      }),
    );

    const result = await contentApi.enqueueGeneration(
      {
        project_id: PROJECT_ID,
        user_instruction: 'Write a landing page for Acme.',
        skill_id: 'article',
      },
      'idem-key-1',
    );
    expect(result.context_summary.crawl_page_count).toBe(3);
    expect(key).toBe('idem-key-1');
    expect(body).toEqual({
      project_id: PROJECT_ID,
      user_instruction: 'Write a landing page for Acme.',
      skill_id: 'article',
    });
  });

  it('keys and requests context previews by selected context inputs', async () => {
    let query = new URLSearchParams();
    mswServer.use(
      http.get('/api/v1/content/context-preview', ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({
          brand_memory: true,
          target_page: 'Pricing',
          issue_count: 1,
          related_page_count: 2,
        });
      }),
    );
    const inputs = {
      target_site_url_id: GENERATION_ID,
      opportunity_id: PROJECT_ID,
    };

    const result = await contentApi.getContextPreview(PROJECT_ID, inputs);

    expect(result.target_page).toBe('Pricing');
    expect(query.get('target_site_url_id')).toBe(GENERATION_ID);
    expect(query.get('opportunity_id')).toBe(PROJECT_ID);
    expect(queryKeys.content.contextPreview(PROJECT_ID, inputs)).not.toEqual(
      queryKeys.content.contextPreview(PROJECT_ID, {}),
    );
  });

  it('searches the persisted target-page projection', async () => {
    let query = new URLSearchParams();
    mswServer.use(
      http.get('/api/v1/content/target-pages', ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json([
          {
            site_url_id: GENERATION_ID,
            title: 'Pricing',
            url: 'https://acme.test/pricing',
            display_url: 'acme.test/pricing',
            page_kind: 'product',
          },
        ]);
      }),
    );

    const pages = await contentApi.listTargetPages(PROJECT_ID, 'pricing');

    expect(pages[0]).toMatchObject({ site_url_id: GENERATION_ID, title: 'Pricing' });
    expect(query.get('project_id')).toBe(PROJECT_ID);
    expect(query.get('query')).toBe('pricing');
  });

  it('uses only the retained detail actions', async () => {
    const seen: string[] = [];
    const action = (suffix: string) =>
      http.post(`/api/v1/content/generations/${GENERATION_ID}/${suffix}`, () => {
        seen.push(suffix);
        return HttpResponse.json(
          suffix === 'cancel'
            ? { ...detail, status: 'cancelled', error_code: 'cancelled' }
            : detail,
          { status: suffix === 'cancel' ? 200 : 201 },
        );
      });
    mswServer.use(
      http.get(`/api/v1/content/generations/${GENERATION_ID}`, () => HttpResponse.json(detail)),
      action('cancel'),
      action('regenerate'),
      action('try-again'),
      http.post(`/api/v1/content/generations/${GENERATION_ID}/feedback`, () =>
        HttpResponse.json({ ...detail, feedback: 'accepted' }),
      ),
    );

    expect((await contentApi.getGeneration(GENERATION_ID)).id).toBe(GENERATION_ID);
    expect((await contentApi.cancelGeneration(GENERATION_ID)).status).toBe('cancelled');
    await contentApi.regenerateGeneration(GENERATION_ID);
    await contentApi.tryAgainGeneration(GENERATION_ID);
    expect((await contentApi.recordFeedback(GENERATION_ID, 'accepted')).feedback).toBe('accepted');
    expect(seen).toEqual(['cancel', 'regenerate', 'try-again']);
  });

  it('deletes one generation and clears terminal project history', async () => {
    const paths: string[] = [];
    mswServer.use(
      http.delete('/api/v1/content/generations/:generationId', ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete('/api/v1/content/generations', ({ request }) => {
        paths.push(`${new URL(request.url).pathname}?${new URL(request.url).searchParams}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(contentApi.deleteGeneration(GENERATION_ID)).resolves.toBeUndefined();
    await expect(contentApi.clearGenerationHistory(PROJECT_ID)).resolves.toBeUndefined();
    expect(paths).toEqual([
      `/api/v1/content/generations/${GENERATION_ID}`,
      `/api/v1/content/generations?project_id=${PROJECT_ID}`,
    ]);
  });
});

describe('content contract guards', () => {
  it('rejects malformed required fields and strips unknown fields', () => {
    expect(() =>
      strictValidate(contentGenerationListItemSchema, { ...listItem, id: 1 }, 'list'),
    ).toThrow(/list/);
    const { generator_version: _version, ...missing } = detail;
    expect(() => strictValidate(contentGenerationDetailSchema, missing, 'detail')).toThrow();
    expect(
      'model' in
        strictValidate(contentGenerationDetailSchema, { ...detail, model: 'gpt' }, 'detail'),
    ).toBe(false);
  });

  it('keeps polling and cache ownership stable', () => {
    expect(queryKeys.content.list(PROJECT_ID, 50)).toEqual(['content', 'list', PROJECT_ID, 50]);
    expect(queryKeys.content.detail(GENERATION_ID)).toEqual(['content', 'detail', GENERATION_ID]);
    expect(CONTENT_LIST_POLL_MS).toBe(3000);
    expect(CONTENT_DETAIL_POLL_MS).toBe(2000);
  });
});
