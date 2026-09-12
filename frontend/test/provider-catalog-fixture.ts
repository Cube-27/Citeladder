import { http, HttpResponse } from 'msw';

/**
 * The provider catalog plus the MSW handlers and connection builder that every
 * provider-facing suite needs.
 *
 * `connection()` and `catalogHandler()` used to be hand-rolled in both
 * connect-provider-dialog.test.tsx and provider-settings.test.tsx. The copies
 * disagreed about `transport_model` for no asserted reason (one file even
 * disagreed with itself between its connection and its test-result handler),
 * so the value is pinned here to the model the catalog actually routes
 * `chatgpt` to.
 */
export const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
export const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const ROUTE_ID = '33333333-3333-4333-8333-333333333333';
export const CHATGPT_MODEL = 'gpt-5.5';

export const providerCatalogFixture = {
  transports: ['openai', 'anthropic', 'google'],
  engines: [
    {
      logical_engine: 'chatgpt',
      routes: [
        {
          transport_provider: 'openai',
          transport_model: 'gpt-5.5',
          retrieval_enabled: true,
          reasoning_effort: 'off',
        },
      ],
    },
    {
      logical_engine: 'gemini',
      routes: [
        {
          transport_provider: 'google',
          transport_model: 'gemini-3.6-flash',
          retrieval_enabled: true,
          reasoning_effort: 'low',
        },
      ],
    },
    {
      logical_engine: 'claude',
      routes: [
        {
          transport_provider: 'anthropic',
          transport_model: 'claude-sonnet-5',
          retrieval_enabled: true,
          reasoning_effort: 'low',
        },
      ],
    },
  ],
};

export function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    workspace_id: WORKSPACE_ID,
    label: 'chatgpt',
    transport_provider: 'openai',
    base_url: null,
    active: true,
    api_key_set: true,
    last_tested_at: null,
    last_test_status: '',
    routes: [
      {
        id: ROUTE_ID,
        logical_engine: 'chatgpt',
        transport_provider: 'openai',
        transport_model: CHATGPT_MODEL,
        is_default: false,
        active: true,
      },
    ],
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

export function catalogHandler() {
  return http.get('/api/v1/provider-catalog', () => HttpResponse.json(providerCatalogFixture));
}

/** The `/test` probe rejecting the stored key. */
export function failedTestHandler() {
  return http.post(`/api/v1/provider-connections/${CONNECTION_ID}/test`, () =>
    HttpResponse.json({
      connection_id: CONNECTION_ID,
      status: 'failed',
      error_code: 'auth_failure',
      detail: 'Invalid API key',
      latency_ms: 10,
      logical_engine: 'chatgpt',
      transport_provider: 'openai',
      transport_model: CHATGPT_MODEL,
      tested_at: '2026-07-15T00:00:00Z',
    }),
  );
}
