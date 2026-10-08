import { describe, expect, it } from 'vite-plus/test';

import { negotiateNotFound } from './not-found';

const page = () =>
  new Response('<!doctype html><title>Page not found</title>', {
    status: 404,
    headers: { 'Content-Type': 'text/html' },
  });
const get = (accept?: string, method = 'GET') =>
  new Request('https://citeladder.com/missing-page', {
    method,
    headers: accept ? { accept } : {},
  });

describe('404 content negotiation', () => {
  it('answers agents that ask for Markdown with a linked Markdown body', async () => {
    const response = negotiateNotFound(get('text/markdown'), page());
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('vary')).toBe('Accept');
    const body = await response.text();
    expect(body).toContain('/missing-page');
    expect(body).toContain('(https://citeladder.com/llms.txt)');
    expect(body).toContain('(https://citeladder.com/sitemap.xml)');
  });

  it('keeps the HTML page for browsers and for HTML preferred over Markdown', async () => {
    for (const accept of [
      'text/html,application/xhtml+xml,*/*;q=0.8',
      'text/html, text/markdown;q=0.5',
      'text/markdown;q=0',
      'text/markdown;q=0.5, */*',
      undefined,
    ]) {
      const response = negotiateNotFound(get(accept), page());
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toBe('text/html');
      expect(response.headers.get('vary')).toBe('Accept');
      expect(await response.text()).toContain('Page not found');
    }
    const preferred = negotiateNotFound(get('text/html;q=0.5, text/markdown'), page());
    expect(preferred.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
  });

  it('leaves other statuses and unsafe methods untouched', async () => {
    const ok = new Response('ok', { status: 200 });
    expect(negotiateNotFound(get('text/markdown'), ok)).toBe(ok);
    const posted = negotiateNotFound(get('text/markdown', 'POST'), page());
    expect(posted.headers.get('content-type')).toBe('text/html');
    const head = negotiateNotFound(get('text/markdown', 'HEAD'), page());
    expect(head.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await head.text()).toBe('');
  });
});
