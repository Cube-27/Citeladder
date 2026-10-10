import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

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

/** An edge cache that honours each entry's max-age, and the work deferred past the response. */
function edge() {
  const entries = new Map<string, { response: Response; expires: number }>();
  const deferred: Promise<unknown>[] = [];
  const cache: CatalogCache = {
    async match(key) {
      const entry = entries.get(String(key));
      return entry && entry.expires > Date.now() ? entry.response.clone() : undefined;
    },
    async put(key, response) {
      const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1]);
      entries.set(String(key), { response, expires: Date.now() + maxAge * 1000 });
    },
  };
  return {
    cache,
    waitUntil: (work: Promise<unknown>) => deferred.push(work),
    settled: () => Promise.all(deferred),
  };
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

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('public catalog server read', () => {
  it('asks for the display region of a geolocated visitor', async () => {
    const forwarded = upstream(() => new Response('unavailable', { status: 503 }));
    const country = displayCountry(new Headers({ 'cf-ipcountry': 'in' }));
    await publicCatalog(env, country, edge());
    expect(new URL(forwarded[0]!.url).searchParams.get('country')).toBe('IN');
  });

  it.each(['XX', 'T1', '', 'IND'])('shows the default region for %j', (value) => {
    expect(displayCountry(new Headers({ 'cf-ipcountry': value }))).toBeUndefined();
  });

  it('treats an invalid upstream response as unavailable', async () => {
    upstream(() => new Response('invalid json'));
    expect(await publicCatalog(env, undefined, edge())).toBeNull();
  });

  it('serves a recent copy without reading the API again', async () => {
    const cached = edge();
    upstream(() => Response.json(catalog('r1')));
    await publicCatalog(env, undefined, cached);
    await cached.settled();
    upstream(() => Response.json(catalog('r2')));
    vi.advanceTimersByTime(599_000);
    expect((await publicCatalog(env, undefined, cached))?.catalog_revision).toBe('r1');
    vi.advanceTimersByTime(2_000);
    expect((await publicCatalog(env, undefined, cached))?.catalog_revision).toBe('r2');
  });

  it('reads the API when the edge cache fails', async () => {
    upstream(() => Response.json(catalog('r1')));
    const broken = {
      cache: {
        match: () => Promise.reject(new Error('cache unavailable')),
        put: () => Promise.reject(new Error('cache unavailable')),
      },
      waitUntil: () => {},
    };
    expect((await publicCatalog(env, undefined, broken))?.catalog_revision).toBe('r1');
  });

  it('falls back to the last good copy while the API is down, until it expires', async () => {
    const cached = edge();
    upstream(() => Response.json(catalog('r1')));
    await publicCatalog(env, 'IN', cached);
    await cached.settled();
    upstream(() => new Response('unavailable', { status: 503 }));
    vi.advanceTimersByTime(601_000);
    expect((await publicCatalog(env, 'IN', cached))?.catalog_revision).toBe('r1');
    expect(await publicCatalog(env, 'US', cached)).toBeNull();
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    expect(await publicCatalog(env, 'IN', cached)).toBeNull();
  });
});
