import { expect, it } from 'vite-plus/test';
import {
  datasetCount,
  datasetCoverage,
  estimateUsd,
  runEstimate,
  searchAmount,
  searchDate,
} from './search-intelligence-format';

it('keeps a calendar date on its own day west of UTC, and zones a timestamp', () => {
  const zone = 'America/Los_Angeles';
  expect(searchDate('2026-01-01', zone)).toBe('Jan 1, 2026');
  expect(searchDate('2026-01-01T03:00:00Z', zone)).toBe('Dec 31, 2025');
  expect(searchDate('soon', zone)).toBeNull();
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

it('rounds an estimate up to four decimals', () => {
  expect(runEstimate(byok)).toBe('$0.0245');
  expect(estimateUsd('1.00000000')).toBe('1.0000');
});

it('prices a provider CPC in its currency, keeping unreported apart from zero', () => {
  expect(searchAmount(3.2, 'USD')).toBe('$3.20');
  expect(searchAmount('0.15', 'USD')).toBe('$0.15');
  expect(searchAmount(0, 'USD')).toBe('$0.00');
  expect(searchAmount(null, 'USD')).toBeNull();
});

it('prices a managed analysis in AI credits only', () => {
  expect(runEstimate(managed)).toBe('32 AI credits');
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
