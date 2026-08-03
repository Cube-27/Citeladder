/**
 * commerceApi contract tests (Commerce workspace): the catalog-health read
 * path and fail-loud strict validation. Transport is stubbed at global fetch
 * (mirrors products.test.ts).
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

const catalogHealth = {
  project_id: UUID2,
  connections: [
    {
      connection_id: UUID,
      provider: 'shopify',
      label: 'Acme shop',
      account_ref: 'acme.myshopify.com',
      grant_status: 'connected',
      last_synced_at: '2026-07-24T06:00:00Z',
      latest_sync: {
        sync_run_id: UUID3,
        connection_id: UUID,
        status: 'succeeded',
        window_start: '2026-07-24T05:00:00Z',
        window_end: '2026-07-24T06:00:00Z',
        row_count: 128,
        error_code: '',
        completed_at: '2026-07-24T06:00:00Z',
      },
    },
  ],
  products: [
    {
      product_id: UUID2,
      connection_id: UUID,
      external_item_ref: 'gid://shopify/Product/1',
      sync_run_id: UUID3,
      status: 'warning',
      highest_severity: 'warning',
      issue_count: 2,
      rule_ids: ['price_missing'],
      last_seen_in_feed: true,
    },
  ],
  generated_at: '2026-07-24T06:05:00Z',
};

const candidate = {
  id: UUID,
  run_id: UUID2,
  task_id: UUID3,
  artifact_id: '33333333-3333-4333-8333-333333333332',
  candidate_kind: 'own',
  competitor_id: null,
  identity: { name: 'Trail shoe' },
  extraction_confidence: 0.9,
  created_at: '2026-07-24T06:00:00Z',
  matches: [],
};

describe('commerceApi', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the catalog-health projection at the project-scoped path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(catalogHealth));
    vi.stubGlobal('fetch', fetchMock);

    const { commerceApi } = await import('./commerce');
    const health = await commerceApi.getCatalogHealth(UUID2);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/api/v1/projects/${UUID2}/commerce/catalog-health`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
    expect(health.connections[0]?.latest_sync?.status).toBe('succeeded');
    expect(health.products[0]?.rule_ids).toEqual(['price_missing']);
  });

  it('accepts null latest_sync / generated_at (never synced)', async () => {
    const empty = {
      ...catalogHealth,
      connections: [{ ...catalogHealth.connections[0], latest_sync: null, last_synced_at: null }],
      products: [],
      generated_at: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(empty));
    vi.stubGlobal('fetch', fetchMock);

    const { commerceApi } = await import('./commerce');
    const health = await commerceApi.getCatalogHealth(UUID2);
    expect(health.connections[0]?.latest_sync).toBeNull();
    expect(health.generated_at).toBeNull();
  });

  it('fails loud on contract drift (unknown feed status, bogus severity)', async () => {
    const drifted = {
      ...catalogHealth,
      products: [{ ...catalogHealth.products[0], status: 'degraded' }],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(drifted));
    vi.stubGlobal('fetch', fetchMock);

    const { commerceApi } = await import('./commerce');
    await expect(commerceApi.getCatalogHealth(UUID2)).rejects.toThrow(
      /API validation failure in commerce\.getCatalogHealth/,
    );
  });

  it('uses same-origin discovery and comparison endpoints with strict DTOs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          accepted: [{ name: 'Trail shoe' }],
          duplicates: [],
          errors: [],
          truncated: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: UUID2,
          project_id: UUID2,
          input_kind: 'upload',
          status: 'queued',
          configuration: {},
          discovery_version: 'v1',
          created_at: '2026-07-24T06:00:00Z',
          completed_at: null,
          candidates: [candidate],
        }),
      )
      .mockResolvedValueOnce(jsonResponse([candidate]))
      .mockResolvedValueOnce(
        jsonResponse({
          id: UUID3,
          project_id: UUID2,
          competitor_id: null,
          source_catalog_ids: { products: [UUID], competitor_products: [] },
          source_artifact_ids: [],
          matcher_version: 'v1',
          comparison_version: 'v1',
          comparison: { coverage: {}, items: [] },
          truncated: false,
          created_at: '2026-07-24T06:00:00Z',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { commerceApi } = await import('./commerce');
    await commerceApi.previewDiscovery(UUID2, { csv_text: 'name\nTrail shoe' });
    await commerceApi.createDiscoveryRun(UUID2, {
      input_kind: 'upload',
      rows: [{ name: 'Trail shoe' }],
    });
    await commerceApi.listDiscoveryCandidates(UUID2, UUID2);
    await commerceApi.createComparison(UUID2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `/api/v1/projects/${UUID2}/commerce/discovery/preview`,
    );
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      `/api/v1/projects/${UUID2}/commerce/discovery/candidates?run_id=${UUID2}`,
    );
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
      `/api/v1/projects/${UUID2}/commerce/comparisons`,
    );
  });
});
