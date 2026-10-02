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
  it('forwards every API and protocol path the product Worker proxies', () => {
    for (const path of [
      '/api',
      '/api?x=1',
      '/api/v1/executions/abc/events?cursor=1',
      `${PROJECT}/ai-referrals?days=30`,
      '/mcp',
      '/mcp/sse',
      '/token?grant=1',
      '/.well-known/oauth-authorization-server',
    ]) {
      expect(upstream(path)).toBe('http://api-service.test');
    }
  });

  it('leaves application routes and look-alike paths to the SPA', () => {
    for (const path of [
      '/projects',
      '/apix',
      '/tokens',
      '/mcpx',
      '/.well-knownXoauth-authorization-server',
    ]) {
      expect(upstream(path)).toBeUndefined();
    }
  });
});
