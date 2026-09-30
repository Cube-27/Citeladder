import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { IntegrationClient } from '../src/integrations/client.ts';
import { integrationPolicy } from '../src/integrations/config.ts';

describe('Bing property discovery', () => {
  it('retains the complete Bing report while normalizing only usable metric rows', async () => {
    const report = {
      d: [
        { Query: 'example query', Date: '/Date(1784505600000)/', Clicks: 3, Impressions: 10 },
        { Query: 'bad metrics', Date: '/Date(1784505600000)/', Clicks: false, Impressions: 10 },
      ],
    };
    const client = new IntegrationClient(
      {},
      {
        fetch: async () => new Response(JSON.stringify(report), { status: 200 }),
        sleep: async () => {},
      },
    );
    const page = await client.page(
      'bing',
      'recorded-token',
      'https://example.test',
      integrationPolicy.datasets.bing_query_daily,
      '2026-07-20',
      '2026-07-21',
      0,
    );
    expect(page.payload.d).toEqual(report.d);
    expect(page.rawRowCount).toBe(2);
    expect(page.payload.rows).toHaveLength(1);
  });
  it.each([
    ['gsc', { siteEntry: 'malformed' }],
    ['bing', { d: {} }],
    ['ga4', { accountSummaries: [], nextPageToken: 23 }],
  ] as const)('classifies a malformed %s discovery response', async (provider, payload) => {
    const client = new IntegrationClient(
      {},
      {
        fetch: async () => new Response(JSON.stringify(payload), { status: 200 }),
        sleep: async () => {},
      },
    );
    await expect(client.properties(provider, 'recorded-token')).rejects.toMatchObject({
      code: 'provider_api_error',
    });
  });
  it('accepts the recorded GetUserSites Site response without a synthetic verification flag', async () => {
    const recorded = await readFile(
      new URL(
        '../../../../backend/tests/fixtures/integrations/bing_sites_response.json',
        import.meta.url,
      ),
      'utf8',
    );
    const client = new IntegrationClient(
      {},
      {
        fetch: async () => new Response(recorded, { status: 200 }),
        sleep: async () => {},
      },
    );
    expect(await client.properties('bing', 'recorded-token')).toEqual([
      { property_ref: 'https://example.com', label: 'https://example.com' },
    ]);
  });
});
