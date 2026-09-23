import { describe, expect, it } from 'vite-plus/test';
import { handleAppRequest } from './worker';

const env: Parameters<typeof handleAppRequest>[1] = {
  PUBLIC_APP_HOST: 'app.citeladder.com',
  ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
  ORIGIN_TOKEN: 'x'.repeat(32),
  ASSETS: {
    fetch: async (request: Request) =>
      new URL(request.url).pathname === '/index.html'
        ? new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } })
        : new Response('missing', { status: 404 }),
  },
};

function request(path: string, method = 'GET', accept = 'text/html'): Request {
  return new Request(`https://app.citeladder.com${path}`, { method, headers: { accept } });
}

describe('product Worker routing', () => {
  it('serves document navigation without turning missing resources or methods into HTML', async () => {
    const document = await handleAppRequest(request('/projects'), env);
    expect(document.status).toBe(200);
    expect(document.headers.get('cache-control')).toBe('no-store');
    expect(document.headers.get('x-robots-tag')).toContain('noindex');
    expect(
      await handleAppRequest(request('/app-assets/missing.js'), env).then((r) => r.status),
    ).toBe(404);
    expect(await handleAppRequest(request('/.assetsignore'), env).then((r) => r.status)).toBe(404);
    expect(await handleAppRequest(request('/projects', 'POST'), env).then((r) => r.status)).toBe(
      405,
    );
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
