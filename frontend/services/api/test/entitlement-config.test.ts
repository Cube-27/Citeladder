import { afterEach, expect, it, vi } from 'vitest';
import vocabulary from '../src/config/entitlements.json' with { type: 'json' };
import { runtimeProjection } from '../src/entitlements/grants.ts';

afterEach(() => {
  vi.doUnmock('../src/config/entitlements.json');
  vi.resetModules();
  vi.unstubAllEnvs();
});

it.each([
  { type: 'counter.rate', rolling_window_seconds: 0 },
  { type: 'counter.occupancy', rolling_window_seconds: 86400 },
  { type: 'level', levels: 2, ordered_values: ['same', 'same'] },
  { type: 'level', levels: 0, ordered_values: [] },
  { type: 'flag', levels: 1, ordered_values: ['on'] },
  { type: 'unsupported' },
])('refuses a malformed capability before resolving grants: %j', async (updates) => {
  vi.resetModules();
  vi.doMock('../src/config/entitlements.json', () => ({
    default: {
      ...vocabulary,
      capabilities: {
        ...vocabulary.capabilities,
        agent: { ...vocabulary.capabilities.agent, ...updates },
      },
    },
  }));
  await expect(import('../src/config/entitlements.ts')).rejects.toThrow('capability');
});

it('bounds full discovery by allowance and operational ceiling, and fails closed to samples', () => {
  vi.stubEnv('SITE_HEALTH_AUTOMATIC_PAGE_LIMIT', '500');
  vi.stubEnv('SITE_HEALTH_SAMPLE_URL_LIMIT', '10');
  vi.stubEnv('SITE_HEALTH_SAMPLE_DISCOVERY_URL_CAP', '200');
  const state = (allowance: number) => ({
    error: null,
    values: new Map([['monitored_urls', allowance]]),
  });
  expect(runtimeProjection(state(20))).toMatchObject({
    discovery_mode: 'full',
    discovery_url_cap: 100,
    monitored_url_limit: 20,
    count_disclosure: true,
  });
  expect(runtimeProjection(state(10000)).discovery_url_cap).toBe(500);
  expect(runtimeProjection({ error: 'unresolved', values: state(20).values })).toEqual(
    runtimeProjection(null),
  );
  expect(runtimeProjection(null)).toMatchObject({
    discovery_mode: 'sample',
    discovery_url_cap: 200,
    sample_url_limit: 10,
    monitored_url_limit: 0,
    count_disclosure: false,
  });
});
