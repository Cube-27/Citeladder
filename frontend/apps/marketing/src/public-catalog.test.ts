import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { displayCountry, publicCatalog, type CatalogCache } from './public-catalog';
import type { ApexEnv } from './apex-route';

const env: ApexEnv = {
  ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
  ORIGIN_TOKEN: 'a'.repeat(32),
  PUBLIC_WEBSITE_HOST: 'citeladder.com',
  PUBLIC_APP_ORIGIN: 'https://app.citeladder.com',
};

const catalog = (revision: string) => ({
  catalog_revision: revision,
  country_code: null,
  region: 'international',
  currency: 'USD',
  currency_minor_units: 2,
  plans: [],
  addons: [],
  topups: [],
  providers: [],
  support_contact: null,
});

/** An edge cache that honours each entry's max-age against a movable clock. */
function edgeCache() {
  let now = 0;
  const entries = new Map<string, { body: string; expires: number }>();
  const cache: CatalogCache = {
    async match(key) {
      const entry = entries.get(String(key));
      return entry && entry.expires > now ? new Response(entry.body) : undefined;
    },
    async put(key, response) {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1]);
      entries.set(String(key), { body: await response.text(), expires: now + maxAge });
    },
  };
  return { cache, advance: (seconds: number) => (now += seconds) };
}

const upstream = (response: () => Response) => {
  const forwarded: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: Request) => {
      forwarded.push(request);
      return response();
    }),
  );
  return forwarded;
};

afterEach(() => vi.unstubAllGlobals());

describe('public catalog server read', () => {
  it('asks for the display region of a geolocated visitor', async () => {
    const forwarded = upstream(() => new Response('unavailable', { status: 503 }));
    const country = displayCountry(new Headers({ 'cf-ipcountry': 'in' }));
    await publicCatalog(env, country, edgeCache().cache);
    expect(new URL(forwarded[0]!.url).searchParams.get('country')).toBe('IN');
  });

  it.each(['XX', 'T1', '', 'IND'])('shows the default region for %j', (value) => {
    expect(displayCountry(new Headers({ 'cf-ipcountry': value }))).toBeUndefined();
  });

  it('treats an invalid upstream response as unavailable', async () => {
    upstream(() => new Response('invalid json'));
    expect(await publicCatalog(env, undefined, edgeCache().cache)).toBeNull();
  });

  it('serves a recent copy without reading the API again', async () => {
    const { cache } = edgeCache();
    upstream(() => Response.json(catalog('r1')));
    await publicCatalog(env, undefined, cache);
    upstream(() => Response.json(catalog('r2')));
    expect((await publicCatalog(env, undefined, cache))?.catalog_revision).toBe('r1');
  });

  it('falls back to the last good copy while the API is down, until it expires', async () => {
    const { cache, advance } = edgeCache();
    upstream(() => Response.json(catalog('r1')));
    await publicCatalog(env, 'IN', cache);
    upstream(() => new Response('unavailable', { status: 503 }));
    advance(601);
    expect((await publicCatalog(env, 'IN', cache))?.catalog_revision).toBe('r1');
    expect(await publicCatalog(env, 'US', cache)).toBeNull();
    advance(7 * 24 * 60 * 60);
    expect(await publicCatalog(env, 'IN', cache)).toBeNull();
  });
});
