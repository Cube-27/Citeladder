import { expect, it } from 'vite-plus/test';
import { estimateUsd, evidenceFields, reportedCost } from './search-intelligence-format';

it('keeps a calendar date on its own day west of UTC, and zones a timestamp', () => {
  const fields = evidenceFields(
    { first_seen: '2026-01-01', last_seen: '2026-01-01T03:00:00Z' },
    {},
    'America/Los_Angeles',
  );
  expect(fields.map(({ value }) => value)).toEqual(['Jan 1, 2026', 'Dec 31, 2025']);
});

it('distinguishes unconfirmed, unknown, zero and fractional provider costs', () => {
  expect(reportedCost({ confirmed_at: null, provider_reported_cost_usd: '1' })).toBe('Not charged');
  expect(reportedCost({ confirmed_at: 'confirmed', provider_reported_cost_usd: null })).toBe(
    'Unresolved',
  );
  expect(reportedCost({ confirmed_at: 'confirmed', provider_reported_cost_usd: '0' })).toBe('$0');
  expect(reportedCost({ confirmed_at: 'confirmed', provider_reported_cost_usd: '0.024468' })).toBe(
    '$0.024468',
  );
  expect(estimateUsd('0.024468')).toBe('0.0245');
  expect(estimateUsd('1.00000000')).toBe('1.0000');
});
