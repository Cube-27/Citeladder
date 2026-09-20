import { expect, it } from 'vite-plus/test';
import { estimateUsd, reportedCost } from './search-intelligence-format';

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
