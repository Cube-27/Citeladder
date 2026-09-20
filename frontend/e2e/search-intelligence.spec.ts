import { expect, test } from '@playwright/test';
import { FIXTURE_PROJECT, fixtureProjectPath, stubAuthedShell } from './helpers/app-fixture';
import type { SearchIntelligenceDataset } from '../lib/api/search-intelligence';

const id = (value: number) => `33333333-3333-4333-8333-${String(value).padStart(12, '0')}`;
const target = {
  identity: 'primary',
  label: 'Best & Less',
  registrable_domain: 'bestandless.com.au',
  hostname: 'www.bestandless.com.au',
  origin: 'https://www.bestandless.com.au',
  source_kind: 'owned',
};
const competitor = {
  identity: id(20),
  label: 'Kmart',
  registrable_domain: 'kmart.com.au',
  hostname: 'kmart.com.au',
  origin: 'https://kmart.com.au',
  source_kind: 'competitor',
};
function dataset(
  value: number,
  kind: string,
  overrides: Partial<SearchIntelligenceDataset> = {},
): SearchIntelligenceDataset {
  return {
    id: id(value),
    run_id: id(10),
    dataset_kind: kind,
    target_domain: target.registrable_domain,
    target_hostname: target.hostname,
    target_origin: target.origin,
    comparison_origin: '',
    location_code: 2840,
    language_code: 'en',
    status: 'published',
    coverage: 'empty',
    requested_rows: 100,
    raw_rows_received: 0,
    unique_rows_saved: 0,
    provider_total: null,
    truncated: false,
    summary: {},
    collection_started_at: null,
    collection_ended_at: null,
    published_at: '2026-09-20T14:07:59Z',
    ...overrides,
  };
}
const datasets = [
  dataset(1, 'footprint', {
    summary: {
      organic_keywords: 4233,
      estimated_monthly_traffic: '8632.703566448763',
      top_10_keywords: 318,
    },
  }),
  dataset(2, 'ranking_keywords', {
    unique_rows_saved: 100,
    provider_total: 4233,
    coverage: 'complete',
  }),
  dataset(3, 'shared_keywords', { comparison_origin: competitor.origin }),
  dataset(4, 'missing_keywords', { comparison_origin: competitor.origin }),
  dataset(5, 'referring_domains', { location_code: null, language_code: '', provider_total: 0 }),
  dataset(6, 'backlink_summary', { location_code: null, language_code: '' }),
];
const rows = Array.from({ length: 10 }, (_, index) => ({
  id: id(100 + index),
  dataset_id: id(2),
  call_id: id(30),
  row_kind: 'ranking_keywords',
  keyword: `Family outfits ${index + 1}`,
  domain: '',
  url: `${target.origin}/family-christmas`,
  search_volume: 3600,
  difficulty: 24,
  intent: 'commercial',
  rank_group: 38,
  owned_rank_group: null,
  etv: '7.55999994',
  backlinks: null,
  referring_main_domains: null,
  dataforseo_rank: null,
  auxiliary: {},
}));

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`saved search results remain readable and do not trigger acquisition at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const project = {
      ...FIXTURE_PROJECT,
      name: target.label,
      website_url: target.origin,
      country_code: 'AU',
    };
    const base = `**/api/v1/projects/${project.id}/search-intelligence`;
    await stubAuthedShell(
      page,
      [
        [
          base,
          {
            connected: true,
            connection_id: id(50),
            owned_targets: [target],
            competitors: [competitor],
            preferences: {
              owned_target_id: 'primary',
              competitor_ids: [],
              location_code: 2036,
              language_code: 'en',
              reuse_recent: true,
              depths: {},
            },
            latest_run: null,
            datasets,
          },
        ],
      ],
      [project],
    );
    await page.route(`${base}/datasets/*/rows*`, (route) => {
      const saved = datasets.find((item) => route.request().url().includes(item.id));
      return route.fulfill({
        json: { dataset: saved, rows: saved?.id === id(2) ? rows : [], next_cursor: null },
      });
    });
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/search-intelligence'))
        writes.push(request.url());
    });
    await page.goto(fixtureProjectPath('/search-intelligence'));
    await expect(page.getByText('8,633', { exact: true })).toBeVisible();
    await expect(page.getByText('United States · en', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Keywords', exact: true }).click();
    await expect(page.getByRole('cell', { name: '8', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('keywords.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Competitors', exact: true }).click();
    await page.getByRole('button', { name: 'shared keywords for Kmart' }).click();
    await expect(
      page.getByText('The provider returned no data for this saved scope.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'All competitors' }).click();
    await expect(page.getByRole('cell', { name: 'Kmart kmart.com.au' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('competitors.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Backlinks', exact: true }).click();
    await expect(
      page.getByText('The provider returned no data for this saved scope.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create content brief' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('backlinks.png'), fullPage: true });
    await page.getByRole('button', { name: 'Analysis settings' }).click();
    await expect(page.getByRole('combobox', { name: 'Market' })).toHaveText('Australia');
    expect(writes).toEqual([]);
  });
}
