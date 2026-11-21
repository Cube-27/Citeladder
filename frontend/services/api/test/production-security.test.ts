import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, secretIsWeak } from '../src/config.ts';
import { demoLoginPassword, productionEnv } from './production-config.ts';

const demoEnv = {
  ...productionEnv,
  DEMO_MODE: 'true',
  DEMO_EXPIRES_AT: '2099-01-01T00:00:00Z',
  DEV_LOGIN_PASSWORD: demoLoginPassword,
};

function exampleSecrets(): Record<string, string> {
  const secretName = /(?:SECRET|PASSWORD|PEPPER|SALT|TOKEN|_KEY)(?:_PREVIOUS)?$/u;
  const text = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
  const secrets: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    const [, name, value] = /^#?\s*([A-Z][A-Z0-9_]*)=(.+)$/u.exec(line.trim()) ?? [];
    if (name && value && secretName.test(name) && !/^(?:NEXT_)?PUBLIC_/u.test(name))
      secrets[name] = value.trim();
  }
  return secrets;
}

function shippedSecret(secrets: Record<string, string>, name: string): string {
  const value = secrets[name];
  if (value === undefined) throw new Error(`.env.example no longer ships ${name}`);
  return value;
}

function startupRefusal(env: Record<string, string>): string {
  try {
    loadConfig(env);
    return 'started';
  } catch (error) {
    return error instanceof ConfigError ? error.message : String(error);
  }
}

describe('deployment environment admission (AR-1)', () => {
  const withoutAppEnv = Object.fromEntries(
    Object.entries(productionEnv).filter(([name]) => name !== 'APP_ENV'),
  );

  it('refuses to start without APP_ENV instead of falling back to development', () => {
    expect(startupRefusal(withoutAppEnv)).toBe(
      'APP_ENV must be set to one of development, test, production',
    );
  });

  it.each(['', 'prod', 'Production', 'staging', 'local'])(
    'refuses to start with the unknown APP_ENV %j',
    (APP_ENV) => {
      expect(startupRefusal({ ...withoutAppEnv, APP_ENV })).toBe(
        'app_env must be one of development, test, production',
      );
    },
  );

  it('starts each known environment', () => {
    expect(
      ['development', 'test', 'production'].map(
        (APP_ENV) => loadConfig({ ...withoutAppEnv, APP_ENV }).appEnv,
      ),
    ).toEqual(['development', 'test', 'production']);
  });
});

describe('.env.example secrets', () => {
  const secrets = exampleSecrets();

  it('refuses the shipped application, origin, database and demo login secrets at production startup', () => {
    const refusal = startupRefusal({
      ...demoEnv,
      CITELADDER_ORIGIN_TOKEN: shippedSecret(secrets, 'CITELADDER_ORIGIN_TOKEN'),
      CITELADDER_ORIGIN_TOKEN_PREVIOUS: shippedSecret(secrets, 'CITELADDER_ORIGIN_TOKEN_PREVIOUS'),
      JWT_SECRET_KEY: shippedSecret(secrets, 'JWT_SECRET_KEY'),
      ENCRYPTION_KEY: shippedSecret(secrets, 'ENCRYPTION_KEY'),
      API_KEY_PEPPER: shippedSecret(secrets, 'API_KEY_PEPPER'),
      DEV_LOGIN_PASSWORD: shippedSecret(secrets, 'DEV_LOGIN_PASSWORD'),
      DATABASE_URL: `postgresql://citeladder_app:${encodeURIComponent(shippedSecret(secrets, 'POSTGRES_PASSWORD'))}@database.test/app`,
    });
    expect(refusal).toContain('JWT_SECRET_KEY does not meet the production strength policy');
    expect(refusal).toContain('ENCRYPTION_KEY does not meet the production strength policy');
    expect(refusal).toContain('API_KEY_PEPPER does not meet the production strength policy');
    expect(refusal).toContain('CITELADDER_ORIGIN_TOKEN must not be a template placeholder');
    expect(refusal).toContain(
      'CITELADDER_ORIGIN_TOKEN_PREVIOUS must not be a template placeholder',
    );
    expect(refusal).toContain('database password does not meet the production strength policy');
    expect(refusal).toContain('dev_login_password does not meet the login password policy');
  });

  it('fails every shipped secret against the production strength policy', () => {
    expect(Object.keys(secrets)).toEqual(
      expect.arrayContaining(['INTEGRATION_GOOGLE_CLIENT_SECRET', 'CITELADDER_ORIGIN_TOKEN']),
    );
    const admitted = Object.entries(secrets)
      .filter(([, value]) => !secretIsWeak(value))
      .map(([name]) => name);
    expect(admitted).toEqual([]);
  });

  it('admits a deployment-grade secret that only contains a policy word', () => {
    expect(secretIsWeak('kV8-qZ3n-Lw7-Rt2-secret-Hy6-Pm4-Xc9-Jd1')).toBe(false);
  });
});

describe('production startup admission', () => {
  it.each([
    ['ENCRYPTION_KEY', 'changeme', 'ENCRYPTION_KEY'],
    ['REFERRAL_HASH_SALT', 'a'.repeat(64), 'REFERRAL_HASH_SALT'],
    ['API_KEY_PEPPER', 'replace-with-a-32-byte-minimum-api-key-pepper', 'API_KEY_PEPPER'],
    ['ENCRYPTION_KEY', productionEnv.JWT_SECRET_KEY, 'independent'],
    ['DATABASE_URL', 'not-a-url', 'database password'],
    ['DATABASE_URL', 'postgresql://citeladder_app:short@database.test/app', 'database password'],
    [
      'DATABASE_URL',
      `postgresql://citeladder_app:${encodeURIComponent(productionEnv.JWT_SECRET_KEY)}@database.test/app`,
      'independent',
    ],
    [
      'DATABASE_URL',
      'postgresql://citeladder:database-owner-password-0123456789@database.test/app',
      'database_url must connect as the citeladder_app role, never the schema owner',
    ],
    ['TRUSTED_PROXY_CIDRS', '', 'trusted_proxy_cidrs'],
    ['TRUSTED_PROXY_CIDRS', '0.0.0.0/0', 'trusted_proxy_cidrs'],
    ['TRUSTED_PROXY_CIDRS', '::/0', 'trusted_proxy_cidrs'],
    [
      'DEV_TEST_LOGIN_ALLOW_PLATFORM_CREDENTIALS',
      'true',
      'dev_test_login_allow_platform_credentials',
    ],
    ['DEV_LOGIN_PASSWORD', demoLoginPassword, 'DEV_LOGIN_PASSWORD must be unset'],
  ])('refuses unsafe %s configuration', (name, value, reason) => {
    expect(() => loadConfig({ ...productionEnv, [name]: value })).toThrow(reason);
  });

  it.each([
    ['password', 'login password'],
    ['a'.repeat(20), 'login password'],
    ['xY12'.repeat(33), 'login password'],
    [productionEnv.ENCRYPTION_KEY, 'independent'],
  ])('refuses the unsafe demo login password %s', (DEV_LOGIN_PASSWORD, reason) => {
    expect(() => loadConfig({ ...demoEnv, DEV_LOGIN_PASSWORD })).toThrow(reason);
  });

  it('starts production without a development login and demo mode with its password', () => {
    expect(loadConfig(productionEnv).demo.enabled).toBe(false);
    expect(loadConfig(demoEnv).demo.enabled).toBe(true);
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
        DATABASE_URL: `postgresql://citeladder_app:${encodeURIComponent('database-password-with-:/@-and-0123456789')}@database.test/app`,
        TRUSTED_PROXY_CIDRS: '10.0.0.1/24,2001:db8::/64',
      }).appEnv,
    ).toBe('production');
  });

  it('rejects malformed proxy ranges before serving', () => {
    expect(() => loadConfig({ ...productionEnv, TRUSTED_PROXY_CIDRS: 'not-a-network' })).toThrow();
  });

  it('requires a timezone-aware demo deadline at startup', () => {
    for (const DEMO_EXPIRES_AT of ['', '2099-01-01T00:00:00'])
      expect(() => loadConfig({ ...demoEnv, DEMO_EXPIRES_AT })).toThrow('demo_expires_at');
    expect(loadConfig({ ...demoEnv, DEMO_EXPIRES_AT: '2000-01-01T00:00:00Z' }).demo.enabled).toBe(
      true,
    );
  });

  it('reports violations without disclosing credentials or the database URL', () => {
    const DATABASE_URL = `postgresql://citeladder_app:${productionEnv.JWT_SECRET_KEY}@database.test/app`;
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
