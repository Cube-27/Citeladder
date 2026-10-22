import { describe, expect, it, vi } from 'vite-plus/test';

import { serveMarketingRequest } from './edge';
import type { ApexEnv } from './apex-route';

const env: ApexEnv = {
  ORIGIN_UPSTREAM: 'https://origin.citeladder.com',
  ORIGIN_TOKEN: 'a'.repeat(32),
  PUBLIC_WEBSITE_HOST: 'citeladder.com',
  PUBLIC_APP_ORIGIN: 'https://app.citeladder.com',
};
const notFoundPage = () =>
  new Response('<!doctype html><title>Page not found</title>', {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
const get = (path: string, accept?: string) =>
  new Request(`https://citeladder.com${path}`, { headers: accept ? { accept } : {} });

describe('marketing Worker edge', () => {
  it('answers apex-owned paths itself, with site headers, before Astro', async () => {
    const render = vi.fn(async () => notFoundPage());
    const response = await serveMarketingRequest(get('/api/v1/auth/me'), env, render);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(render).not.toHaveBeenCalled();
  });

  it('permanently redirects retired research URLs before Astro', async () => {
    const render = vi.fn(async () => notFoundPage());
    const response = await serveMarketingRequest(get('/check-ai-visibility/'), env, render);
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://citeladder.com/blog/verify-improve-ai-search-visibility',
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('serves the prerendered 404 page as Markdown to agents and as HTML to browsers', async () => {
    const agent = await serveMarketingRequest(
      get('/wp-login.php', 'text/markdown'),
      env,
      async () => notFoundPage(),
    );
    expect(agent.status).toBe(404);
    expect(agent.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await agent.text()).toContain('`/wp-login.php`');

    const browser = await serveMarketingRequest(get('/wp-login.php', 'text/html'), env, async () =>
      notFoundPage(),
    );
    expect(browser.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(browser.headers.get('vary')).toBe('Accept');
    expect(await browser.text()).toContain('Page not found');
  });

  it('leaves non-HTML 404s from Astro routes untouched', async () => {
    const json = Response.json({ error: 'missing' }, { status: 404 });
    const response = await serveMarketingRequest(
      get('/api/v1/contact', 'text/markdown'),
      env,
      async () => json,
    );
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ error: 'missing' });
  });
});
