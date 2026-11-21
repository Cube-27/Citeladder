import { businessModelSchema } from '@citeladder/contracts/project';
import { describe, expect, it, vi } from 'vitest';
import auditRuntime from '../src/config/audits.json' with { type: 'json' };
import trafficRuntime from '../src/config/traffic.json' with { type: 'json' };

import { ConfigError, demoAccessExpired, loadConfig, policy } from '../src/config.ts';
import { loadWorkerSettings } from '../src/config/analytics.ts';
import { resolveSettingSpec } from '../src/config/settings.ts';
import { poolOptions } from '../src/db/database.ts';
import { razorpaySettings } from '../src/billing/config.ts';
import { productionEnv } from './production-config.ts';

const STRONG_KEY = 'a-deployment-grade-session-key-with-enough-entropy-9';

it('lets the brand profile edit every business model discovery can resolve', () => {
  expect(businessModelSchema.options).toEqual(policy.discovery.constants.business_models);
});

it('applies production and test-key aliases to Razorpay credential admission', () => {
  const env = {
    APP_ENV: 'production',
    BILLING_RAZORPAY_MODE: 'test',
    RAZORPAY_TEST_KEY_ID: 'fixture-id',
    RAZORPAY_TEST_KEY_SECRET: 'fixture-secret',
  };
  expect(razorpaySettings(env)).toMatchObject({
    production: true,
    keyId: 'fixture-id',
    keySecret: 'fixture-secret',
    conflicting: false,
  });
  expect(razorpaySettings({ ...env, BILLING_RAZORPAY_MODE: 'live' }).conflicting).toBe(true);
});

describe('loadConfig', () => {
  it('reports missing provider routes as configuration failures during composition', async () => {
    vi.resetModules();
    vi.doMock('../src/config/audits.json', () => ({
      default: {
        ...auditRuntime,
        route_policies: { ...auditRuntime.route_policies, unregistered: {} },
      },
    }));
    try {
      await expect(import('../src/config/audits.ts')).rejects.toThrow(
        'Audit engine unregistered has no provider route',
      );
    } finally {
      vi.doUnmock('../src/config/audits.json');
      vi.resetModules();
    }
  });

  it('derives unavailable performance dimensions from excluded acquisition datasets', async () => {
    vi.resetModules();
    vi.doMock('../src/config/traffic.json', () => ({
      default: {
        ...trafficRuntime,
        PERFORMANCE_DIMENSION_DATASETS: {
          ...trafficRuntime.PERFORMANCE_DIMENSION_DATASETS,
          unavailable: 'gsc_search_appearance_daily',
        },
      },
    }));
    try {
      const { traffic } = await import('../src/config/connected-data.ts');
      expect(traffic.PERFORMANCE_UNAVAILABLE_DIMENSIONS).toContain('unavailable');
    } finally {
      vi.doUnmock('../src/config/traffic.json');
      vi.resetModules();
    }
  });
  it('refuses invalid JEV thresholds and destinations before accepting work', () => {
    expect(() =>
      loadConfig({ APP_ENV: 'test', JEV_FAIL_BELOW: '0.5', JEV_FLAG_BELOW: '0.3' }),
    ).toThrow('Invalid JEV thresholds');
    expect(() =>
      loadConfig({ APP_ENV: 'test', JEV_DUPLICATE_FAIL_AT: '0.5', JEV_DUPLICATE_FLAG_AT: '0.7' }),
    ).toThrow('Invalid JEV thresholds');
    expect(() => loadConfig({ APP_ENV: 'test', JEV_BASE_URL: 'http://example.test' })).toThrow(
      'JEV_BASE_URL',
    );
    expect(() => loadConfig({ APP_ENV: 'test', JEV_BASE_URL: 'not-a-url' })).toThrow(ConfigError);
    for (const baseUrl of ['https://example.test?token=fixture', 'https://example.test#fragment'])
      expect(() => loadConfig({ APP_ENV: 'test', JEV_BASE_URL: baseUrl })).toThrow(ConfigError);
    expect(() => loadConfig({ APP_ENV: 'test', JEV_TIMEOUT_SECONDS: '61' })).toThrow(ConfigError);
  });
  it('resolves native abuse budgets with case-insensitive aliases and positive integer bounds', () => {
    const spec = policy.abuse.login_email_limit;
    expect(resolveSettingSpec(spec, { abuse_login_email_limit: '7' })).toBe(7);
    for (const value of ['0', '-1', '1.5']) {
      expect(() => resolveSettingSpec(spec, { ABUSE_LOGIN_EMAIL_LIMIT: value })).toThrow(
        ConfigError,
      );
    }
  });

  it('uses native config defaults when the environment is silent', () => {
    const config = loadConfig({ APP_ENV: 'test' });
    expect(config.database.poolSize).toBe(policy.settings.db_pool_size.default);
    expect(config.session.cookieName).toBe(policy.settings.session_cookie_name.default);
  });

  it('validates every owner setting at startup and hands owners the startup values', () => {
    expect(() => loadConfig({ APP_ENV: 'test', INTEGRATION_LEASE_TTL_SECONDS: '0' })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ APP_ENV: 'test', RUNNER_DB_POOL_SIZE: '5' })).toThrow(ConfigError);
    expect(() =>
      loadConfig({ APP_ENV: 'test', ANALYTICS_HEARTBEAT_INTERVAL_SECONDS: '100000' }),
    ).toThrow('heartbeat_interval_seconds');
    const config = loadConfig({
      APP_ENV: 'test',
      ANALYTICS_TASK_MAX_ATTEMPTS: '7',
      RUNNER_BUDGET_SECONDS: '90',
    });
    expect(loadWorkerSettings(config.settings).taskMaxAttempts).toBe(7);
    expect(config.execution.budgetSeconds).toBe(90);
  });

  it('matches environment names case-insensitively.', () => {
    expect(loadConfig({ APP_ENV: 'test', db_pool_size: '7' }).database.poolSize).toBe(7);
  });

  it('rejects a value at an exported exclusive maximum', () => {
    const spec = { env: ['BOUNDED'], type: 'float', default: 1, exclusive_maximum: 672 };
    expect(resolveSettingSpec(spec, { BOUNDED: '671.5' })).toBe(671.5);
    expect(() => resolveSettingSpec(spec, { BOUNDED: '672' })).toThrow(ConfigError);
  });

  it('refuses a value whose type contradicts the type of its default', () => {
    const spec = { env: ['MISTYPED'], type: 'str', default: 0 };
    expect(resolveSettingSpec(spec, {})).toBe(0);
    expect(() => resolveSettingSpec(spec, { MISTYPED: '5' })).toThrow('MISTYPED must be a number');
  });

  it('enforces field bounds and literal values', () => {
    expect(() => loadConfig({ APP_ENV: 'test', DB_POOL_SIZE: '51' })).toThrow(ConfigError);
    expect(() => loadConfig({ APP_ENV: 'test', DB_POOL_SIZE: 'twenty' })).toThrow(ConfigError);
    expect(() => loadConfig({ APP_ENV: 'test', DB_SSL_MODE: 'prefer' })).toThrow(ConfigError);
  });

  it('refuses placeholder secrets and unencrypted databases outside development', () => {
    expect(() => loadConfig({ APP_ENV: 'production', DB_SSL_MODE: 'require' })).toThrow(
      /JWT_SECRET_KEY/u,
    );
    expect(() => loadConfig({ APP_ENV: 'production', JWT_SECRET_KEY: STRONG_KEY })).toThrow(
      /db_ssl_mode/u,
    );
    const config = loadConfig(productionEnv);
    expect(poolOptions(config).ssl).toEqual({ rejectUnauthorized: false });
  });

  it('carries the backend timeouts into the pool', () => {
    const options = poolOptions(loadConfig({ APP_ENV: 'test', DB_STATEMENT_TIMEOUT_MS: '9000' }));
    expect(options.statement_timeout).toBe(9000);
    expect(options.max).toBe(
      policy.settings.db_pool_size.default + policy.settings.db_max_overflow.default,
    );
  });

  it('sizes the API pool from its own settings even when it starts runner jobs', () => {
    const config = loadConfig({
      APP_ENV: 'test',
      CLOUD_RUN_RUNNER_JOB: 'projects/p/locations/us-central1/jobs/runner',
      CITELADDER_ORIGIN_TOKEN: 'o'.repeat(32),
      DB_POOL_SIZE: '9',
      DB_MAX_OVERFLOW: '1',
      RUNNER_DB_POOL_SIZE: '3',
    });
    expect(poolOptions(config).max).toBe(10);
    expect(poolOptions(config, { execution: true }).max).toBe(3);
  });
});

describe('demoAccessExpired', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('is never expired outside demo mode', () => {
    expect(demoAccessExpired(loadConfig({ APP_ENV: 'test' }), now)).toBe(false);
  });

  it('fails closed without a timezone-aware future deadline', () => {
    expect(demoAccessExpired(loadConfig({ APP_ENV: 'test', DEMO_MODE: 'true' }), now)).toBe(true);
    const naive = loadConfig({
      APP_ENV: 'test',
      DEMO_MODE: 'true',
      DEMO_EXPIRES_AT: '2030-01-01T00:00:00',
    });
    expect(demoAccessExpired(naive, now)).toBe(true);
    const past = loadConfig({
      APP_ENV: 'test',
      DEMO_MODE: 'yes',
      DEMO_EXPIRES_AT: '2026-09-27T11:59:59Z',
    });
    expect(demoAccessExpired(past, now)).toBe(true);
    const future = loadConfig({
      APP_ENV: 'test',
      DEMO_MODE: '1',
      DEMO_EXPIRES_AT: '2026-09-27T13:00:00+01:00',
    });
    expect(demoAccessExpired(future, now)).toBe(true);
    const open = loadConfig({
      APP_ENV: 'test',
      DEMO_MODE: 'on',
      DEMO_EXPIRES_AT: '2026-09-28T00:00:00Z',
    });
    expect(demoAccessExpired(open, now)).toBe(false);
  });

  it.each(['2026-02-30T00:00:00Z', 'Mar 5 2026 10:00 +0530'])('refuses %s at boot', (value) => {
    expect(() => loadConfig({ APP_ENV: 'test', DEMO_EXPIRES_AT: value })).toThrow(ConfigError);
  });
});
