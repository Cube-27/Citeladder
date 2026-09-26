import { describe, expect, it, vi } from 'vite-plus/test';
import { handleAppRequest } from './worker';

const env: Parameters<typeof handleAppRequest>[1] = {
  PUBLIC_APP_HOST: 'app.citeladder.com',
  ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
  ORIGIN_TOKEN: 'x'.repeat(32),
  ASSETS: {
    fetch: async (request: Request) =>
      new URL(request.url).pathname === '/index.html'
        ? new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } })
        : new URL(request.url).pathname === '/app-assets/page-DqDZ7Zs-.js'
          ? new Response('export {};', { headers: { 'Content-Type': 'text/javascript' } })
          : new Response('missing', { status: 404 }),
  },
};

function request(path: string, method = 'GET', accept = 'text/html'): Request {
  return new Request(`https://app.citeladder.com${path}`, { method, headers: { accept } });
}

describe('product Worker routing', () => {
  it('enforces document policy on root, deep links and direct HTML', async () => {
    for (const path of ['/', '/agent/actions', '/index.html']) {
      const document = await handleAppRequest(request(path), env);
      const policy = Object.fromEntries(
        document.headers
          .get('content-security-policy')!
          .split(';')
          .map((directive) => {
            const [name, ...sources] = directive.trim().split(/\s+/);
            return [name, sources];
          }),
      );
      expect(policy['object-src']).toEqual(["'none'"]);
      expect(policy['frame-ancestors']).toEqual(["'none'"]);
      expect(policy['script-src']).not.toContain("'unsafe-inline'");
      expect(policy['script-src']).not.toContain("'unsafe-eval'");
      expect(document.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('preserves an upstream consent or sandbox policy instead of weakening it', async () => {
    const policy = "default-src 'none'; sandbox";
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html></html>', {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': policy,
          'Cache-Control': 'no-store',
        },
      }),
    );
    try {
      const result = await handleAppRequest(request('/mcp/oauth/consent'), env);
      expect(result.headers.get('content-security-policy')).toBe(policy);
      expect(result.headers.get('cache-control')).toBe('private, no-store');
      expect(result.headers.get('x-robots-tag')).toContain('noindex');
    } finally {
      fetch.mockRestore();
    }
  });

  it('serves document navigation without turning missing resources or methods into HTML', async () => {
    const document = await handleAppRequest(request('/projects'), env);
    expect(document.status).toBe(200);
    expect(document.headers.get('cache-control')).toBe('no-store');
    expect(document.headers.get('x-robots-tag')).toContain('noindex');
    expect(
      await handleAppRequest(request('/app-assets/missing.js'), env).then((r) => r.status),
    ).toBe(404);
    expect(await handleAppRequest(request('/.assetsignore'), env).then((r) => r.status)).toBe(404);
    expect(
      (await handleAppRequest(request('/app-assets/page-DqDZ7Zs-.js'), env)).headers.get(
        'cache-control',
      ),
    ).toContain('immutable');
    expect(await handleAppRequest(request('/projects', 'POST'), env).then((r) => r.status)).toBe(
      405,
    );
  });

  it('accepts the documented local HTTPS port for app navigation', async () => {
    const result = await handleAppRequest(
      new Request('https://app.citeladder.com:8787/projects', {
        headers: { accept: 'text/html' },
      }),
      env,
    );
    expect(result.status).toBe(200);
  });

  it('rejects apex-owned and machine-facing endpoints on the app host', async () => {
    for (const path of [
      '/api/v1/billing/webhooks/razorpay',
      '/api/v1/billing/%77ebhooks/razorpay',
      '/mcp/register',
      '/authorize',
      '/.well-known/oauth-authorization-server',
    ]) {
      const result = await handleAppRequest(request(path, 'GET'), env);
      expect(result.status).toBe(404);
      expect(result.headers.get('cache-control')).toBe('no-store');
    }
  });
});
