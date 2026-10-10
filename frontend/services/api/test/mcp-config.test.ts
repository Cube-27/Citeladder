import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { accountAllowed, loadMcpConfig } from '../src/mcp/config.ts';
import { productionEnv } from './production-config.ts';

const base = {
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1/test',
  JWT_SECRET_KEY: 'test-secret',
};
afterEach(() => vi.unstubAllEnvs());
it('binds MCP enablement and origin to explicit startup inputs instead of inherited settings', () => {
  vi.stubEnv('MCP_ENABLED', 'true');
  vi.stubEnv('PUBLIC_API_URL', 'https://inherited.example.test');
  const disabled = loadConfig(base);
  expect(loadMcpConfig(disabled).enabled).toBe(false);
  const enabled = loadConfig({
    ...base,
    MCP_ENABLED: 'true',
    PUBLIC_API_URL: 'https://protocol.example.test:443',
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
    ...productionEnv,
    MCP_ENABLED: 'true',
    PUBLIC_API_URL: 'https://protocol.example.test',
    FRONTEND_URL: 'https://app.example.test',
  };
  expect(loadMcpConfig(loadConfig(production)).enabled).toBe(true);
  expect(() => loadMcpConfig(loadConfig({ ...production, ENCRYPTION_KEY: '' }))).toThrow(
    'ENCRYPTION_KEY',
  );
  expect(() =>
    loadMcpConfig(loadConfig({ ...production, ENCRYPTION_KEY: production.JWT_SECRET_KEY })),
  ).toThrow('independent');
  // No fallback to the app origin: enabled MCP without the API host fails at startup.
  expect(() => loadMcpConfig(loadConfig({ ...production, PUBLIC_API_URL: '' }))).toThrow(
    'PUBLIC_API_URL must be configured for MCP',
  );
  expect(() =>
    loadMcpConfig(loadConfig({ ...production, PUBLIC_API_URL: 'http://protocol.example.test' })),
  ).toThrow('PUBLIC_API_URL must use HTTPS in production');
  for (const origin of [
    'https://user@example.test',
    'https://example.test/path',
    'file:///tmp/record',
    'https://example.test?secret',
  ])
    expect(() =>
      loadMcpConfig(loadConfig({ ...base, MCP_ENABLED: 'true', PUBLIC_API_URL: origin })),
    ).toThrow();
  const demo = loadConfig({
    ...base,
    MCP_ENABLED: 'true',
    PUBLIC_API_URL: 'https://protocol.example.test',
    DEMO_MODE: 'true',
    DEMO_EXPIRES_AT: '2099-01-01T00:00:00Z',
    DEV_LOGIN_EMAIL: 'demo@example.test',
    MCP_ALLOWED_ACCOUNT_EMAIL: 'demo@example.test',
  });
  const settings = loadMcpConfig(demo);
  expect(accountAllowed(demo, settings, 'outsider@example.test')).toBe(false);
  expect(accountAllowed(demo, settings, 'DEMO@example.test')).toBe(true);
});
