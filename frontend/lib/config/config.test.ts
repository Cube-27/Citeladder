// @vitest-environment node
//
// Pure logic: no DOM, no window, no React render. The suite-wide jsdom
// default costs a full environment per file and buys nothing here.
import { afterEach, describe, expect, it } from 'vitest';

import {
  PENDING_PRICING_INTENT_MAX_AGE_MS,
  PRICING_BYOK_DEFAULT_ON,
  USAGE_METER_CRITICAL_RATIO,
  USAGE_METER_WARNING_RATIO,
} from './billing';
import { getLogoDevPublishable, getSiteUrl } from './env';
import {
  API_BASE_URL,
  DEFAULT_API_REQUEST_TIMEOUT_MS,
  MAX_REPETITIONS,
  MIN_REPETITIONS,
  DEFAULT_REPETITIONS,
  getApiRequestTimeoutMs,
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

/**
 * `lib/config` is the frontend's config owner (invariant 1) and had no tests.
 * These lock the rules the values have to satisfy — not the values themselves,
 * which are meant to be tuned. A test that just restates a number would fail on
 * every deliberate change and prove nothing; these fail only when a change
 * makes the configuration incoherent.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('billing config', () => {
  it('orders the usage-meter bands below one', () => {
    expect(USAGE_METER_WARNING_RATIO).toBeLessThan(USAGE_METER_CRITICAL_RATIO);
    expect(USAGE_METER_CRITICAL_RATIO).toBeLessThan(1);
    expect(USAGE_METER_WARNING_RATIO).toBeGreaterThan(0);
  });

  it('keeps a captured pricing intent short-lived', () => {
    expect(PENDING_PRICING_INTENT_MAX_AGE_MS).toBeGreaterThan(0);
    expect(PRICING_BYOK_DEFAULT_ON).toBe(true);
  });
});

describe('env config', () => {
  it('reads public variables lazily so a test can change them', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';
    expect(getSiteUrl()).toBe('https://example.test');
  });

  it('treats an empty variable as absent rather than an empty string', () => {
    // An empty string is falsy but would still be *set*; returning it would
    // produce URLs like `/pricing` prefixed with nothing.
    process.env.NEXT_PUBLIC_SITE_URL = '';
    process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE = '';
    expect(getSiteUrl()).toBeUndefined();
    expect(getLogoDevPublishable()).toBeUndefined();
  });

  it('is undefined when the variable is not set at all', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBeUndefined();
  });
});

describe('operational config', () => {
  it('keeps browser traffic same-origin', () => {
    // Invariant 12: browser calls go through the frontend proxy, never to an
    // absolute backend origin.
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

  it.each(['0', '-1', 'soon', '', 'NaN'])(
    'ignores the unusable override %j and keeps the default',
    (value) => {
      // A zero or negative timeout would abort every request immediately, so
      // an unusable value must not be honoured.
      process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS = value;
      expect(getApiRequestTimeoutMs()).toBe(DEFAULT_API_REQUEST_TIMEOUT_MS);
    },
  );

  it('bounds the repetition range around its default', () => {
    expect(MIN_REPETITIONS).toBeGreaterThan(0);
    expect(MIN_REPETITIONS).toBeLessThanOrEqual(DEFAULT_REPETITIONS);
    expect(DEFAULT_REPETITIONS).toBeLessThanOrEqual(MAX_REPETITIONS);
  });
});

describe('stream reconnect cadences', () => {
  it.each([
    ['runs', RUN_STREAM_RECONNECT_BASE_MS, RUN_STREAM_RECONNECT_MAX_MS],
    ['site health', SITE_HEALTH_STREAM_RECONNECT_BASE_MS, SITE_HEALTH_STREAM_RECONNECT_MAX_MS],
  ])('backs %s off from a base up to a ceiling', (_name, base, max) => {
    expect(base).toBeGreaterThan(0);
    // A ceiling at or below the base would defeat the backoff entirely.
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
