import { describe, expect, it } from 'vite-plus/test';
import { createServerProxy } from './server-proxy';

const PROJECT = '/api/v1/projects/00000000-0000-4000-8000-000000000000';

/** The origin Vite proxies `url` to: the first key, in insertion order, that matches. */
function upstream(url: string): string | undefined {
  const table = createServerProxy('http://api-service.test');
  const key = Object.keys(table).find((entry) => new RegExp(entry).test(url));
  return key === undefined ? undefined : String(table[key]?.target);
}

describe('dev server proxy', () => {
  it('forwards every API path and MCP consent, as the product Worker does', () => {
    for (const path of [
      '/api',
      '/api?x=1',
      '/api/v1/executions/abc/events?cursor=1',
      `${PROJECT}/ai-traffic/referrals?days=30`,
      '/mcp/oauth/consent?transaction=abc',
    ]) {
      expect(upstream(path)).toBe('http://api-service.test');
    }
  });

  it('keeps the app Host on MCP consent, which the API admits only on the app origin', () => {
    const table = createServerProxy('http://api-service.test');
    const option = (url: string) =>
      Object.entries(table).find(([key]) => new RegExp(key).test(url))?.[1].changeOrigin;
    expect(option('/mcp/oauth/consent?transaction=abc')).toBe(false);
    expect(option('/api/v1/auth/me')).toBe(true);
  });

  it('leaves application routes, look-alike paths and the MCP protocol to the SPA', () => {
    for (const path of [
      '/projects',
      '/apix',
      '/tokens',
      '/mcpx',
      // MCP and its OAuth endpoints live on the API host, never the app origin.
      '/mcp',
      '/mcp/register',
      '/token?grant=1',
      '/.well-known/oauth-authorization-server',
    ]) {
      expect(upstream(path)).toBeUndefined();
    }
  });
});
