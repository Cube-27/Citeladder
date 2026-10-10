import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { dispatchRequest, type DispatchEnv } from './host-dispatch';

afterEach(() => vi.unstubAllGlobals());

function setup(asset: Response) {
  const assets: string[] = [];
  const rendered: string[] = [];
  const env: DispatchEnv = {
    ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
    ORIGIN_TOKEN: 'a'.repeat(32),
    PUBLIC_API_HOST: 'api.citeladder.com',
    ASSETS: {
      fetch: async (request) => {
        assets.push(`${request.method} ${new URL(request.url).pathname}`);
        return asset.clone();
      },
    },
  };
  const render = async (request: Request) => {
    rendered.push(`${request.method} ${new URL(request.url).pathname}`);
    return new Response('astro', { status: 200 });
  };
  return { env, render, assets, rendered };
}

describe('host dispatch', () => {
  it('serves what the assets answer on the marketing host, redirects included', async () => {
    const redirect = new Response(null, {
      status: 301,
      headers: { location: '/platform/site-health?source=test' },
    });
    const { env, render, rendered } = setup(redirect);
    const response = await dispatchRequest(
      new Request('https://citeladder.com/platform/site-health/?source=test'),
      env,
      render,
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/platform/site-health?source=test');
    expect(rendered).toEqual([]);
  });
  it('renders in Astro on an asset miss and for other methods without asking the assets', async () => {
    const { env, render, assets, rendered } = setup(new Response(null, { status: 404 }));
    expect(
      await (
        await dispatchRequest(new Request('https://citeladder.com/pricing'), env, render)
      ).text(),
    ).toBe('astro');
    await dispatchRequest(
      new Request('https://citeladder.com/api/v1/contact', { method: 'POST', body: '{}' }),
      env,
      render,
    );
    expect(assets).toEqual(['GET /pricing']);
    expect(rendered).toEqual(['GET /pricing', 'POST /api/v1/contact']);
  });
  it('answers the API host itself, never with an asset or an Astro page', async () => {
    const { env, render, assets, rendered } = setup(new Response('<html>home</html>'));
    const response = await dispatchRequest(new Request('https://api.citeladder.com/'), env, render);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found' } });
    expect([...assets, ...rendered]).toEqual([]);
  });
});
