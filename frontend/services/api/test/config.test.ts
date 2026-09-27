import { describe, expect, it } from 'vitest';

import { ConfigError, demoAccessExpired, loadConfig, policy } from '../src/config.ts';
import { libpqUrl, poolOptions } from '../src/db/database.ts';

const STRONG_KEY = 'a-deployment-grade-session-key-with-enough-entropy-9';

describe('loadConfig', () => {
  it('uses the exported Python defaults when the environment is silent', () => {
    const config = loadConfig({});
    expect(config.database.poolSize).toBe(policy.settings.db_pool_size.default);
    expect(config.session.cookieName).toBe(policy.settings.session_cookie_name.default);
    expect(config.readinessTimeoutMs).toBe(policy.api.readiness_timeout_seconds * 1000);
  });

  it('matches environment names case-insensitively, as pydantic-settings does', () => {
    expect(loadConfig({ db_pool_size: '7' }).database.poolSize).toBe(7);
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
    const config = loadConfig({
      APP_ENV: 'production',
      JWT_SECRET_KEY: STRONG_KEY,
      DB_SSL_MODE: 'require',
    });
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
