import { describe, expect, it } from 'vite-plus/test';
import { createServerProxy } from './server-proxy';

const PROJECT = '/api/v1/projects/00000000-0000-4000-8000-000000000000';

/** The origin Vite proxies `url` to: the first key, in insertion order, that matches. */
function upstream(url: string): string | undefined {
  const table = createServerProxy('http://backend.test', 'http://api-service.test');
  const key = Object.keys(table).find((entry) => new RegExp(entry).test(url));
  return key === undefined ? undefined : String(table[key]?.target);
}

describe('dev server proxy', () => {
  it('routes TypeScript-owned paths the way the production Caddy matcher does', () => {
    // `/api/v1/executions/*` is a Caddy prefix match, so nested paths follow it.
    expect(upstream('/api/v1/executions/abc/events?cursor=1')).toBe('http://api-service.test');
    expect(upstream(`${PROJECT}/ai-referrals?days=30`)).toBe('http://api-service.test');
    expect(upstream(`${PROJECT}/nested/ai-referrals`)).toBe('http://backend.test');
    expect(upstream(`${PROJECT}/ai-referrals-extra`)).toBe('http://backend.test');
    expect(upstream('/api/v1/projects')).toBe('http://backend.test');
  });

  it('folds case as Caddy does and keeps every backend path', () => {
    expect(upstream('/API/V1/Executions/abc')).toBe('http://api-service.test');
    expect(upstream('/Api/v1/projects?x=1')).toBe('http://backend.test');
    for (const path of [
      '/api',
      '/mcp/sse',
      '/token?grant=1',
      '/.well-known/oauth-authorization-server',
    ]) {
      expect(upstream(path)).toBe('http://backend.test');
    }
    expect(upstream('/apix')).toBeUndefined();
    expect(upstream('/.well-knownXoauth-authorization-server')).toBeUndefined();
  });
});
