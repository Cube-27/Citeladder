// @vitest-environment node
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { PENDING_PRICING_INTENT_MAX_AGE_MS, USAGE_METER_WARNING_RATIO } from './billing';
import { getLogoDevPublishable } from './env';
import { publicOrigins } from './public-origins';
import {
  API_BASE_URL,
  DEFAULT_API_REQUEST_TIMEOUT_MS,
  DEFAULT_BOOTSTRAP_READ_TIMEOUT_MS,
  getApiRequestTimeoutMs,
  getBootstrapReadTimeoutMs,
} from './operational';
import {
  RUN_STREAM_RECONNECT_BASE_MS,
  RUN_STREAM_RECONNECT_MAX_MS,
  RUN_STREAM_INVALIDATE_DEBOUNCE_MS,
} from './runs';
import {
  RERUN_MAX_PRE_ACTIVE_POLLS,
  SITE_HEALTH_STREAM_RECONNECT_BASE_MS,
  SITE_HEALTH_STREAM_RECONNECT_MAX_MS,
} from './site-health';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('billing config', () => {
  it('places the usage-meter warning inside the allowance', () => {
    expect(USAGE_METER_WARNING_RATIO).toBeLessThan(1);
    expect(USAGE_METER_WARNING_RATIO).toBeGreaterThan(0);
  });

  it('keeps a captured pricing intent short-lived', () => {
    expect(PENDING_PRICING_INTENT_MAX_AGE_MS).toBeGreaterThan(0);
  });
});

describe('env config', () => {
  it('treats an empty publishable token as absent', () => {
    process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE = '';
    expect(getLogoDevPublishable()).toBeUndefined();
  });
});

describe('public origins', () => {
  it('requires explicit HTTPS origins in production', () => {
    expect(() => publicOrigins('', 'https://app.example.test', true)).toThrow();
    expect(() => publicOrigins('http://example.test', 'https://app.example.test', true)).toThrow();
    expect(() =>
      publicOrigins('https://example.test/path', 'https://app.example.test', true),
    ).toThrow();
    expect(() =>
      publicOrigins('https://example.test', 'https://app.example.test', true),
    ).not.toThrow();
  });

  it('permits explicit local HTTP origins during development', () => {
    expect(publicOrigins('http://localhost:3000', 'http://localhost:3001', false).app?.origin).toBe(
      'http://localhost:3001',
    );
  });
});

describe('operational config', () => {
  it('keeps browser traffic same-origin', () => {
    expect(API_BASE_URL).toBe('/api/v1');
    expect(API_BASE_URL.startsWith('/')).toBe(true);
  });

  it('falls back to the default timeout when the override is absent', () => {
    delete process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS;
    expect(getApiRequestTimeoutMs()).toBe(DEFAULT_API_REQUEST_TIMEOUT_MS);
  });

  it('uses a valid positive override', () => {
    process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS = '5000';
    expect(getApiRequestTimeoutMs()).toBe(5_000);
  });

  it('caps a valid override at the supported timer delay', () => {
    process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS = '2147483648';
    expect(getApiRequestTimeoutMs()).toBe(2_147_483_647);
  });

  it.each(['0', '-1', 'soon', '', 'NaN', '8s', '1.5', '1e3', 'Infinity', '9007199254740992'])(
    'ignores the unusable override %j and keeps the default',
    (value) => {
      process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS = value;
      expect(getApiRequestTimeoutMs()).toBe(DEFAULT_API_REQUEST_TIMEOUT_MS);
    },
  );

  it('keeps the bootstrap read bound under the ordinary request timeout', () => {
    delete process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS;
    delete process.env.NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS;
    expect(getBootstrapReadTimeoutMs()).toBe(DEFAULT_BOOTSTRAP_READ_TIMEOUT_MS);
    expect(getBootstrapReadTimeoutMs()).toBeLessThan(getApiRequestTimeoutMs());
  });

  it('uses a valid positive bootstrap override', () => {
    process.env.NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS = '4000';
    expect(getBootstrapReadTimeoutMs()).toBe(4_000);
  });

  it.each(['0', '-1', 'soon', '', 'NaN', '8s', '1.5', '1e3'])(
    'ignores the unusable bootstrap override %j and keeps the default',
    (value) => {
      process.env.NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS = value;
      expect(getBootstrapReadTimeoutMs()).toBe(DEFAULT_BOOTSTRAP_READ_TIMEOUT_MS);
    },
  );
});

describe('stream reconnect cadences', () => {
  it.each([
    ['runs', RUN_STREAM_RECONNECT_BASE_MS, RUN_STREAM_RECONNECT_MAX_MS],
    ['site health', SITE_HEALTH_STREAM_RECONNECT_BASE_MS, SITE_HEALTH_STREAM_RECONNECT_MAX_MS],
  ])('backs %s off from a base up to a ceiling', (_name, base, max) => {
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(max);
  });

  it('coalesces bursts without stalling the UI', () => {
    expect(RUN_STREAM_INVALIDATE_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(RUN_STREAM_INVALIDATE_DEBOUNCE_MS).toBeLessThan(RUN_STREAM_RECONNECT_BASE_MS);
  });

  it('bounds the pre-active rerun polling so it cannot loop forever', () => {
    expect(RERUN_MAX_PRE_ACTIVE_POLLS).toBeGreaterThan(0);
    expect(Number.isInteger(RERUN_MAX_PRE_ACTIVE_POLLS)).toBe(true);
  });
});
