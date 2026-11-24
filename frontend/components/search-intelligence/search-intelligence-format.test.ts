import { expect, it } from 'vite-plus/test';
import {
  datasetCount,
  datasetCoverage,
  estimateUsd,
  evidenceFields,
  reportedCost,
  runEstimate,
  searchAmount,
} from './search-intelligence-format';

it('keeps a calendar date on its own day west of UTC, and zones a timestamp', () => {
  const fields = evidenceFields({
    kind: 'referring_domains',
    row: { first_seen: '2026-01-01', last_seen: '2026-01-01T03:00:00Z' },
    timeZone: 'America/Los_Angeles',
  });
  expect(fields.map(({ value }) => value)).toEqual(['Jan 1, 2026', 'Dec 31, 2025']);
});

const byok = {
  credential_mode: 'byok' as const,
  confirmed_at: 'confirmed',
  estimated_cost_usd: '0.024468',
  provider_reported_cost_usd: null,
  estimated_credits: null,
  charged_credits: null,
};
const managed = {
  ...byok,
  credential_mode: 'funded' as const,
  estimated_cost_usd: null,
  estimated_credits: 32,
};

it('distinguishes unconfirmed, unknown, zero and fractional provider costs', () => {
  expect(reportedCost({ ...byok, confirmed_at: null, provider_reported_cost_usd: '1' })).toBe(
    'Not charged',
  );
  expect(reportedCost(byok)).toBe('Unresolved');
  expect(reportedCost({ ...byok, provider_reported_cost_usd: '0' })).toBe('$0');
  expect(reportedCost({ ...byok, provider_reported_cost_usd: '0.024468' })).toBe('$0.024468');
  expect(runEstimate(byok)).toBe('$0.0245');
  expect(estimateUsd('1.00000000')).toBe('1.0000');
});

it('prices a provider CPC in its currency, keeping unreported apart from zero', () => {
  expect(searchAmount(3.2, 'USD')).toBe('$3.20');
  expect(searchAmount('0.15', 'USD')).toBe('$0.15');
  expect(searchAmount(0, 'USD')).toBe('$0.00');
  expect(searchAmount(null, 'USD')).toBeNull();
});

it('prices a managed analysis in AI credits only, pending until it settles', () => {
  expect(runEstimate(managed)).toBe('32 AI credits');
  expect(reportedCost(managed)).toBe('Pending');
  expect(reportedCost({ ...managed, charged_credits: 1 })).toBe('1 AI credit');
  expect(reportedCost({ ...managed, confirmed_at: null })).toBe('Not charged');
});

it('counts saved rows against the provider total wherever fewer were saved', () => {
  expect(datasetCount({ provider_total: 82_247, unique_rows_saved: 50 })).toBe('50 of 82,247');
  expect(datasetCount({ provider_total: 50, unique_rows_saved: 50 })).toBe('50');
  expect(datasetCount({ provider_total: null, unique_rows_saved: 12 })).toBe('12 saved');
  expect(datasetCount({ provider_total: null, unique_rows_saved: 0 })).toBe('No results');
  expect(datasetCount(undefined)).toBe('Not fetched');
  const saved = { dataset_kind: 'backlinks', summary: {}, truncated: true };
  expect(datasetCoverage({ ...saved, provider_total: 82_247, unique_rows_saved: 50 })).toBe(
    '50 of 82,247 saved',
  );
  expect(datasetCoverage({ ...saved, provider_total: 50, unique_rows_saved: 50 })).toBeNull();
  expect(datasetCoverage({ ...saved, provider_total: null, unique_rows_saved: 50 })).toBe(
    'Truncated',
  );
  const matches = { dataset_kind: 'citation_matches', provider_total: null, truncated: false };
  expect(
    datasetCoverage({
      ...matches,
      unique_rows_saved: 0,
      summary: { referring_domains_compared: 50, referring_domains_total: 2_062 },
    }),
  ).toBe('Against 50 of 2,062 referring domains');
  expect(
    datasetCoverage({
      ...matches,
      unique_rows_saved: 0,
      summary: { referring_domains_compared: 3 },
    }),
  ).toBe('Against 3 referring domains');
});

it('opens only what the table row lacks, and no broken flag a blocked crawler raised', () => {
  const link = {
    id: 'row',
    url: 'https://shop.example/',
    url_from: 'https://blog.example/post',
    domain: 'blog.example',
    keyword: '',
    search_volume: null,
    dataforseo_rank: 40,
    backlinks_spam_score: 3,
    is_broken: true,
    url_to_status_code: 403,
  };
  const shown = (row: Record<string, unknown>) =>
    evidenceFields({ kind: 'backlinks', row, timeZone: 'UTC' }).map(({ label, value }) => [
      label,
      value,
    ]);
  expect(shown(link)).toEqual([
    ['Source URL', 'https://blog.example/post'],
    ['Domain', 'blog.example'],
    ['Spam', '3'],
    ['Target status', '403'],
  ]);
  expect(shown({ ...link, url_to_status_code: 404 })).toContainEqual(['Is broken', 'Yes']);
  expect(
    evidenceFields({
      kind: 'shared_keywords',
      row: { keyword: 'shoes', rank_group: 2, owned_rank_group: 4, search_volume: 90 },
      timeZone: 'UTC',
    }),
  ).toEqual([]);
});
