import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { displayCountry, publicCatalog } from './public-catalog';
import type { ApexEnv } from './apex-route';

const env: ApexEnv = {
  ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
  ORIGIN_TOKEN: 'a'.repeat(32),
  PUBLIC_WEBSITE_HOST: 'citeladder.com',
  PUBLIC_APP_ORIGIN: 'https://app.citeladder.com',
};

afterEach(() => vi.unstubAllGlobals());

describe('public catalog server read', () => {
  it('keeps visitor credentials out of protected origin requests', async () => {
    const forwarded: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        forwarded.push(request);
        return new Response('unavailable', { status: 503 });
      }),
    );
    expect(await publicCatalog(env)).toBeNull();
    expect(forwarded[0]?.headers.has('cookie')).toBe(false);
    expect(forwarded[0]?.headers.get('x-citeladder-public-host')).toBe('citeladder.com');
  });

  it('asks for the display region of a geolocated visitor', async () => {
    const forwarded: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        forwarded.push(request);
        return new Response('unavailable', { status: 503 });
      }),
    );
    await publicCatalog(env, displayCountry(new Headers({ 'cf-ipcountry': 'in' })));
    expect(new URL(forwarded[0]!.url).searchParams.get('country')).toBe('IN');
  });

  it.each(['XX', 'T1', '', 'IND'])('shows the default region for %j', (value) => {
    expect(displayCountry(new Headers({ 'cf-ipcountry': value }))).toBeUndefined();
  });

  it('treats an invalid upstream response as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid json')),
    );
    expect(await publicCatalog(env)).toBeNull();
  });
});
