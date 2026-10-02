import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  demoAccessExpired,
  loadConfig,
  policy,
  resolveSettingSpec,
} from '../src/config.ts';
import { libpqUrl, poolOptions } from '../src/db/database.ts';
import { razorpaySettings } from '../src/billing/config.ts';
import { productionEnv } from './production-config.ts';

const STRONG_KEY = 'a-deployment-grade-session-key-with-enough-entropy-9';

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
  it('refuses invalid JEV thresholds and destinations before accepting work', () => {
    expect(() => loadConfig({ JEV_FAIL_BELOW: '0.5', JEV_FLAG_BELOW: '0.3' })).toThrow(
      'Invalid JEV thresholds',
    );
    expect(() =>
      loadConfig({ JEV_DUPLICATE_FAIL_AT: '0.5', JEV_DUPLICATE_FLAG_AT: '0.7' }),
    ).toThrow('Invalid JEV thresholds');
    expect(() => loadConfig({ JEV_BASE_URL: 'http://example.test' })).toThrow('JEV_BASE_URL');
    expect(() => loadConfig({ JEV_TIMEOUT_SECONDS: '61' })).toThrow(ConfigError);
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

  it('uses the exported Python defaults when the environment is silent', () => {
    const config = loadConfig({});
    expect(config.database.poolSize).toBe(policy.settings.db_pool_size.default);
    expect(config.session.cookieName).toBe(policy.settings.session_cookie_name.default);
    expect(config.readinessTimeoutMs).toBe(policy.api.readiness_timeout_seconds * 1000);
  });

  it('matches environment names case-insensitively, as pydantic-settings does', () => {
    expect(loadConfig({ db_pool_size: '7' }).database.poolSize).toBe(7);
  });

  it('rejects a value at an exported exclusive maximum', () => {
    const spec = { env: ['BOUNDED'], type: 'float', default: 1, exclusive_maximum: 672 };
    expect(resolveSettingSpec(spec, { BOUNDED: '671.5' })).toBe(671.5);
    expect(() => resolveSettingSpec(spec, { BOUNDED: '672' })).toThrow(ConfigError);
  });

  it('enforces the Python field bounds and literal values', () => {
    expect(() => loadConfig({ DB_POOL_SIZE: '51' })).toThrow(ConfigError);
    expect(() => loadConfig({ DB_POOL_SIZE: 'twenty' })).toThrow(ConfigError);
    expect(() => loadConfig({ DB_SSL_MODE: 'prefer' })).toThrow(ConfigError);
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
    const options = poolOptions(loadConfig({ DB_STATEMENT_TIMEOUT_MS: '9000' }));
    expect(options.statement_timeout).toBe(9000);
    expect(options.max).toBe(
      policy.settings.db_pool_size.default + policy.settings.db_max_overflow.default,
    );
  });

  it('accepts the backend SQLAlchemy database URL', () => {
    expect(libpqUrl('postgresql+asyncpg://u:p@db:5432/app')).toBe('postgresql://u:p@db:5432/app');
  });
});

describe('demoAccessExpired', () => {
  const now = new Date('2026-09-27T12:00:00Z');

  it('is never expired outside demo mode', () => {
    expect(demoAccessExpired(loadConfig({}), now)).toBe(false);
  });

  it('fails closed without a timezone-aware future deadline', () => {
    expect(demoAccessExpired(loadConfig({ DEMO_MODE: 'true' }), now)).toBe(true);
    const naive = loadConfig({ DEMO_MODE: 'true', DEMO_EXPIRES_AT: '2030-01-01T00:00:00' });
    expect(demoAccessExpired(naive, now)).toBe(true);
    const past = loadConfig({ DEMO_MODE: 'yes', DEMO_EXPIRES_AT: '2026-09-27T11:59:59Z' });
    expect(demoAccessExpired(past, now)).toBe(true);
    const future = loadConfig({ DEMO_MODE: '1', DEMO_EXPIRES_AT: '2026-09-27T13:00:00+01:00' });
    expect(demoAccessExpired(future, now)).toBe(true);
    const open = loadConfig({ DEMO_MODE: 'on', DEMO_EXPIRES_AT: '2026-09-28T00:00:00Z' });
    expect(demoAccessExpired(open, now)).toBe(false);
  });

  it.each(['2026-02-30T00:00:00Z', 'Mar 5 2026 10:00 +0530'])(
    'refuses %s at boot, as pydantic does',
    (value) => {
      expect(() => loadConfig({ DEMO_EXPIRES_AT: value })).toThrow(ConfigError);
    },
  );
});
