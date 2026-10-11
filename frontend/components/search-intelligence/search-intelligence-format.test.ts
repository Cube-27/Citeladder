import { expect, it } from 'vite-plus/test';
import {
  estimateUsd,
  evidenceFields,
  reportedCost,
  runEstimate,
} from './search-intelligence-format';

it('keeps a calendar date on its own day west of UTC, and zones a timestamp', () => {
  const fields = evidenceFields(
    { first_seen: '2026-01-01', last_seen: '2026-01-01T03:00:00Z' },
    {},
    'America/Los_Angeles',
  );
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

it('prices a managed analysis in AI credits only, pending until it settles', () => {
  expect(runEstimate(managed)).toBe('32 AI credits');
  expect(reportedCost(managed)).toBe('Pending');
  expect(reportedCost({ ...managed, charged_credits: 1 })).toBe('1 AI credit');
  expect(reportedCost({ ...managed, confirmed_at: null })).toBe('Not charged');
});
