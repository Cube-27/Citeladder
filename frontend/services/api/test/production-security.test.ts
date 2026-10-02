import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.ts';
import { productionEnv } from './production-config.ts';

describe('production startup admission', () => {
  it.each([
    ['ENCRYPTION_KEY', 'changeme', 'ENCRYPTION_KEY'],
    ['REFERRAL_HASH_SALT', 'a'.repeat(64), 'REFERRAL_HASH_SALT'],
    ['ENCRYPTION_KEY', productionEnv.JWT_SECRET_KEY, 'independent'],
    ['DATABASE_URL', 'not-a-url', 'database password'],
    ['DATABASE_URL', 'postgresql://fixture:short@database.test/app', 'database password'],
    [
      'DATABASE_URL',
      `postgresql://fixture:${encodeURIComponent(productionEnv.JWT_SECRET_KEY)}@database.test/app`,
      'independent',
    ],
    ['TRUSTED_PROXY_CIDRS', '', 'trusted_proxy_cidrs'],
    ['TRUSTED_PROXY_CIDRS', '0.0.0.0/0', 'trusted_proxy_cidrs'],
    ['TRUSTED_PROXY_CIDRS', '::/0', 'trusted_proxy_cidrs'],
    [
      'DEV_TEST_LOGIN_ALLOW_PLATFORM_CREDENTIALS',
      'true',
      'dev_test_login_allow_platform_credentials',
    ],
    ['DEV_LOGIN_PASSWORD', 'password', 'login password'],
    ['DEV_LOGIN_PASSWORD', 'a'.repeat(20), 'login password'],
    ['DEV_LOGIN_PASSWORD', 'xY12'.repeat(33), 'login password'],
    ['DEV_LOGIN_PASSWORD', productionEnv.ENCRYPTION_KEY, 'independent'],
  ])('refuses unsafe %s configuration', (name, value, reason) => {
    expect(() => loadConfig({ ...productionEnv, [name]: value })).toThrow(reason);
  });

  it.each([
    'https://localhost.',
    'https://127.20.0.4',
    'https://[::1]',
    'https://0.0.0.0',
    'https://0.0.0.1',
    'https://[::ffff:0.0.0.1]',
    'https://[::]',
    'https://169.254.169.254',
    'https://[fe80::1]',
    'https://0177.0.0.1',
    'https://0x7f000001',
    'http://app.example.test',
    'https://user:pass@app.example.test',
    'https://@app.example.test',
    'https://app.example.test/path',
    'https://app.example.test/path/..',
    'https://app.example.test?redirect=elsewhere',
    'https://app.example.test#fragment',
    '/relative',
  ])('refuses unsafe redirect origin %s', (FRONTEND_URL) => {
    expect(() => loadConfig({ ...productionEnv, FRONTEND_URL })).toThrow('frontend_url');
  });

  it('accepts encoded independent database passwords and explicit proxy subnets', () => {
    expect(
      loadConfig({
        ...productionEnv,
        FRONTEND_URL: 'https://0.app.example.test',
        DATABASE_URL: `postgresql://fixture:${encodeURIComponent('database-password-with-:/@-and-0123456789')}@database.test/app`,
        TRUSTED_PROXY_CIDRS: '10.0.0.1/24,2001:db8::/64',
      }).appEnv,
    ).toBe('production');
  });

  it('rejects malformed proxy ranges before serving', () => {
    expect(() => loadConfig({ ...productionEnv, TRUSTED_PROXY_CIDRS: 'not-a-network' })).toThrow();
  });

  it('requires a timezone-aware demo deadline at startup', () => {
    for (const DEMO_EXPIRES_AT of ['', '2099-01-01T00:00:00'])
      expect(() => loadConfig({ ...productionEnv, DEMO_MODE: 'true', DEMO_EXPIRES_AT })).toThrow(
        'demo_expires_at',
      );
    expect(
      loadConfig({ ...productionEnv, DEMO_MODE: 'true', DEMO_EXPIRES_AT: '2000-01-01T00:00:00Z' })
        .demo.enabled,
    ).toBe(true);
  });

  it('reports violations without disclosing credentials or the database URL', () => {
    const DATABASE_URL = `postgresql://fixture:${productionEnv.JWT_SECRET_KEY}@database.test/app`;
    try {
      loadConfig({ ...productionEnv, DATABASE_URL });
      expect.fail('startup should refuse reused database credentials');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect(String(error)).not.toContain(productionEnv.JWT_SECRET_KEY);
      expect(String(error)).not.toContain(DATABASE_URL);
    }
  });
});
