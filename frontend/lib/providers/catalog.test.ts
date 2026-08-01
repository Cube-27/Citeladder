import { describe, expect, it } from 'vitest';

import type { ProviderCatalog, ProviderConnection } from '@/lib/api/types';
import {
  buildEngineCards,
  isConnectable,
  connectionForTransport,
  discoveryModelOptions,
  isConfigured,
  mergeRoutePayload,
} from './catalog';

// v2 direct-provider retirement: the catalog lists exactly one direct
// transport per logical engine (ChatGPT/OpenAI, Gemini/Google, Claude/Anthropic).
const catalog: ProviderCatalog = {
  transports: ['openai', 'anthropic', 'google'],
  engines: [
    {
      logical_engine: 'chatgpt',
      routes: [{ transport_provider: 'openai', default_model: 'gpt-5.4' }],
    },
    {
      logical_engine: 'gemini',
      routes: [{ transport_provider: 'google', default_model: 'gemini-flash-latest' }],
    },
    {
      logical_engine: 'claude',
      routes: [{ transport_provider: 'anthropic', default_model: 'claude-sonnet-4-6' }],
    },
  ],
};

describe('buildEngineCards', () => {
  it('renders the shipped engines in order, then the planned ones', () => {
    const cards = buildEngineCards(catalog);
    expect(cards.map((c) => c.logical_engine)).toEqual([
      'chatgpt',
      'gemini',
      'claude',
      'grok',
      'perplexity',
      'copilot',
    ]);
  });

  // The approved marketing exception is safe only because a planned provider
  // is route-less and unavailable — that is what stops anything downstream
  // resolving it to a working transport.
  it('makes every planned provider unavailable, route-less and unconnectable', () => {
    const cards = buildEngineCards(catalog);
    const planned = cards.filter((c) => ['grok', 'perplexity', 'copilot'].includes(c.logical_engine));

    expect(planned).toHaveLength(3);
    for (const card of planned) {
      expect(card.route).toBeNull();
      expect(card.availability).toBe('unavailable');
      expect(card.state).toBe('unavailable');
      expect(isConnectable(card)).toBe(false);
    }
  });

  // "We stored a key" and "the key works" are different facts. Only a
  // successful probe may show as connected.
  it('fails closed to missing when no authenticated state is supplied', () => {
    const cards = buildEngineCards(catalog);
    expect(cards.find((c) => c.logical_engine === 'chatgpt')?.state).toBe('missing');
  });

  it('reflects the authenticated four-state projection', () => {
    const cards = buildEngineCards(catalog, [
      {
        key: 'chatgpt',
        label: 'ChatGPT',
        state: 'connected',
        safe_reason: null,
        grant_key: 'provider.openai',
        latest_probe: {
          status: 'ok',
          safe_reason: null,
          tested_at: '2026-08-01T00:00:00Z',
          model: 'gpt-5.4',
          latency_ms: 900,
        },
      },
      {
        key: 'gemini',
        label: 'Gemini',
        state: 'failed',
        safe_reason: 'auth',
        grant_key: 'provider.google',
        latest_probe: {
          status: 'failed',
          safe_reason: 'auth',
          tested_at: '2026-08-01T00:00:00Z',
          model: null,
          latency_ms: null,
        },
      },
    ]);

    expect(cards.find((c) => c.logical_engine === 'chatgpt')?.state).toBe('connected');
    expect(cards.find((c) => c.logical_engine === 'gemini')?.state).toBe('failed');
    expect(cards.find((c) => c.logical_engine === 'claude')?.state).toBe('missing');
  });

  it('gives each engine exactly one direct route with the direct label', () => {
    const cards = buildEngineCards(catalog);
    const matrix: Record<string, { transport: string; model: string }> = {
      chatgpt: { transport: 'openai', model: 'gpt-5.4' },
      gemini: { transport: 'google', model: 'gemini-flash-latest' },
      claude: { transport: 'anthropic', model: 'claude-sonnet-4-6' },
    };
    for (const [engine, expected] of Object.entries(matrix)) {
      const card = cards.find((c) => c.logical_engine === engine)!;
      expect(card.route).not.toBeNull();
      expect(card.route!.transport_provider).toBe(expected.transport);
      expect(card.route!.default_model).toBe(expected.model);
    }
  });

  it('labels the ChatGPT route as Direct (OpenAI)', () => {
    const chatgpt = buildEngineCards(catalog).find((c) => c.logical_engine === 'chatgpt')!;
    expect(chatgpt.route!.label).toBe('Direct (OpenAI)');
    const serialized = JSON.stringify(chatgpt);
    expect(serialized).not.toContain('coming soon');
  });

  it('is resilient to an undefined catalog (all cards, null routes)', () => {
    const cards = buildEngineCards(undefined);
    expect(cards).toHaveLength(6);
    expect(cards.every((c) => c.route === null)).toBe(true);
    expect(cards.every((c) => !isConnectable(c))).toBe(true);
  });
});

describe('connection helpers', () => {
  const conn: ProviderConnection = {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    transport_provider: 'openai',
    base_url: null,
    active: true,
    api_key_set: true,
    routes: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        logical_engine: 'chatgpt',
        transport_provider: 'openai',
        transport_model: 'gpt-5.4',
        is_default: true,
      },
    ],
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
  };

  it('finds a connection by transport and reports configured', () => {
    expect(connectionForTransport([conn], 'openai')).toBe(conn);
    expect(connectionForTransport([conn], 'google')).toBeUndefined();
    expect(isConfigured(conn)).toBe(true);
    expect(isConfigured(undefined)).toBe(false);
    expect(isConfigured({ ...conn, api_key_set: false })).toBe(false);
  });

  it('merges a new engine route while preserving existing ones', () => {
    const merged = mergeRoutePayload(conn, 'gemini', 'gemini-flash-latest');
    expect(merged.map((r) => r.logical_engine).sort()).toEqual(['chatgpt', 'gemini']);
    // Idempotent: re-adding an existing engine does not duplicate it.
    const again = mergeRoutePayload(conn, 'chatgpt', 'gpt-5.4');
    expect(again).toHaveLength(1);
  });
});

describe('discoveryModelOptions', () => {
  it('flattens every approved route into a labelled option', () => {
    const options = discoveryModelOptions(catalog);
    expect(options).toHaveLength(3);
    expect(options[0].label).toContain('ChatGPT');
    expect(options[0].label).toContain('OpenAI');
    expect(discoveryModelOptions(undefined)).toEqual([]);
  });
});
