import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { publicCatalog } from './public-catalog';
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

  it('treats an invalid upstream response as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid json')),
    );
    expect(await publicCatalog(env)).toBeNull();
  });
});
