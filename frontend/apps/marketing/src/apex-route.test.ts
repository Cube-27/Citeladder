import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { routeApexRequest, type ApexEnv } from './apex-route';

const env: ApexEnv = {
  ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
  ORIGIN_TOKEN: 'a'.repeat(32),
  PUBLIC_WEBSITE_HOST: 'citeladder.com',
  PUBLIC_APP_ORIGIN: 'https://app.citeladder.com',
};

afterEach(() => vi.unstubAllGlobals());

describe('apex route ownership', () => {
  it('keeps product and browser API paths absent', async () => {
    for (const path of ['/login', '/projects', '/app-assets/old.js', '/api/v1/auth/me']) {
      const response = await routeApexRequest(new Request(`https://citeladder.com${path}`), env);
      expect(response?.status).toBe(404);
      expect(response?.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('never proxies MCP, its OAuth endpoints or consent: the site 404s them', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const [method, path] of [
      ['POST', '/mcp'],
      ['GET', '/mcp/oauth/consent?transaction=abc'],
      ['POST', '/mcp/register'],
      ['GET', '/authorize'],
      ['POST', '/token'],
      ['POST', '/revoke'],
      ['GET', '/.well-known/oauth-authorization-server'],
      ['GET', '/.well-known/oauth-protected-resource/mcp'],
    ] as const)
      expect(
        await routeApexRequest(new Request('https://citeladder.com' + path, { method }), env),
      ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes webhook bytes through protected transport', async () => {
    const sent: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        sent.push(request);
        return new Response(null, { status: 204 });
      }),
    );
    const webhook = await routeApexRequest(
      new Request('https://citeladder.com/api/v1/billing/webhooks/razorpay', {
        method: 'POST',
        body: 'signed-body',
      }),
      env,
    );
    expect(webhook?.status).toBe(204);
    expect(await sent[0]?.text()).toBe('signed-body');
    expect(sent[0]?.headers.get('x-citeladder-origin-token')).toBe(env.ORIGIN_TOKEN);
    expect(await routeApexRequest(new Request('https://citeladder.com/pricing'), env)).toBeNull();
    expect(
      await routeApexRequest(
        new Request('https://citeladder.com/api/v1/contact', { method: 'POST' }),
        env,
      ),
    ).toBeNull();
    expect(
      (await routeApexRequest(new Request('https://citeladder.com/api/v1/contact/other'), env))
        ?.status,
    ).toBe(404);
  });

  it('allows local Wrangler HTTP only with the explicit development binding', async () => {
    const request = new Request('http://citeladder.com/pricing');
    expect((await routeApexRequest(request, env))?.status).toBe(404);
    expect(await routeApexRequest(request, { ...env, LOCAL_WORKER_ORIGIN: 'true' })).toBeNull();
  });
  it('refuses machine ingest on the apex: crawl logs live on the API host only', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const path of [
      '/api/v1/crawl-logs/ingest/11111111-1111-4111-8111-111111111111',
      '/v1/crawl-logs/ingest/11111111-1111-4111-8111-111111111111',
    ]) {
      const response = await routeApexRequest(
        new Request('https://citeladder.com' + path, { method: 'POST', body: '{}' }),
        env,
      );
      expect(response?.status).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
