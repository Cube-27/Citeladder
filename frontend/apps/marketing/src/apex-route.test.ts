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
  it('keeps product and browser API paths absent while routing consent to the app', async () => {
    for (const path of ['/login', '/projects', '/app-assets/old.js', '/api/v1/auth/me']) {
      const response = await routeApexRequest(new Request(`https://citeladder.com${path}`), env);
      expect(response?.status).toBe(404);
      expect(response?.headers.get('cache-control')).toBe('no-store');
    }
    const consent = await routeApexRequest(
      new Request('https://citeladder.com/mcp/oauth/consent?transaction=abc'),
      env,
    );
    expect(consent?.headers.get('location')).toBe(
      'https://app.citeladder.com/mcp/oauth/consent?transaction=abc',
    );
    const submitted = await routeApexRequest(
      new Request('https://citeladder.com/mcp/oauth/consent', { method: 'POST' }),
      env,
    );
    expect(submitted?.status).toBe(409);
  });

  it('passes webhook bytes and MCP responses through protected transport', async () => {
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
    expect((await routeApexRequest(new Request('https://citeladder.com/mcp'), env))?.status).toBe(
      204,
    );
    expect(await routeApexRequest(new Request('https://citeladder.com/pricing'), env)).toBeNull();
  });

  it('allows local Wrangler HTTP only with the explicit development binding', async () => {
    const request = new Request('http://citeladder.com/pricing');
    expect((await routeApexRequest(request, env))?.status).toBe(404);
    expect(await routeApexRequest(request, { ...env, LOCAL_WORKER_ORIGIN: 'true' })).toBeNull();
  });
});
