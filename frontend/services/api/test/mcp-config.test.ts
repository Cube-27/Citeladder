import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { accountAllowed, loadMcpConfig } from '../src/mcp/config.ts';

const base = {
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1/test',
  JWT_SECRET_KEY: 'test-secret',
};
afterEach(() => vi.unstubAllEnvs());
it('binds MCP enablement and origin to explicit startup inputs instead of inherited settings', () => {
  vi.stubEnv('MCP_ENABLED', 'true');
  vi.stubEnv('MCP_PUBLIC_BASE_URL', 'https://inherited.example.test');
  const disabled = loadConfig(base);
  expect(loadMcpConfig(disabled).enabled).toBe(false);
  const enabled = loadConfig({
    ...base,
    MCP_ENABLED: 'true',
    MCP_PUBLIC_BASE_URL: 'https://protocol.example.test:443',
    FRONTEND_URL: 'https://app.example.test:443',
  });
  vi.stubEnv('MCP_ENABLED', 'false');
  expect(loadMcpConfig(enabled)).toMatchObject({
    enabled: true,
    origin: 'https://protocol.example.test',
    browserOrigin: 'https://app.example.test',
  });
});
it('refuses unsafe enabled origins and enforces production and demo admission', () => {
  const production = {
    ...base,
    APP_ENV: 'production',
    DB_SSL_MODE: 'require',
    JWT_SECRET_KEY: 'aB09xY82pQ7eT1kL5mN3vF6sW4rC8hJ2',
    MCP_ENABLED: 'true',
    MCP_PUBLIC_BASE_URL: 'https://protocol.example.test',
    FRONTEND_URL: 'https://app.example.test',
  };
  expect(() => loadMcpConfig(loadConfig(production))).toThrow('ENCRYPTION_KEY');
  expect(() =>
    loadMcpConfig(loadConfig({ ...production, ENCRYPTION_KEY: production.JWT_SECRET_KEY })),
  ).toThrow('independent');
  for (const origin of [
    'https://user@example.test',
    'https://example.test/path',
    'file:///tmp/record',
    'https://example.test?secret',
  ])
    expect(() =>
      loadMcpConfig(loadConfig({ ...base, MCP_ENABLED: 'true', MCP_PUBLIC_BASE_URL: origin })),
    ).toThrow();
  const demo = loadConfig({
    ...base,
    MCP_ENABLED: 'true',
    MCP_PUBLIC_BASE_URL: 'https://protocol.example.test',
    DEMO_MODE: 'true',
    DEMO_EXPIRES_AT: '2099-01-01T00:00:00Z',
    DEV_LOGIN_EMAIL: 'demo@example.test',
    MCP_ALLOWED_ACCOUNT_EMAIL: 'demo@example.test',
  });
  const settings = loadMcpConfig(demo);
  expect(accountAllowed(demo, settings, 'outsider@example.test')).toBe(false);
  expect(accountAllowed(demo, settings, 'DEMO@example.test')).toBe(true);
});
