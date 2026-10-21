import { describe, expect, it } from 'vitest';

import { routePath } from './marketing-nav';

describe('routePath', () => {
  it('reads the homepage from its prerendered file name', () => {
    expect(routePath('/index.html')).toBe('/');
    expect(routePath('/')).toBe('/');
  });

  it('reads a page and a nested page from their prerendered file names', () => {
    expect(routePath('/enterprise.html')).toBe('/enterprise');
    expect(routePath('/platform/site-health.html')).toBe('/platform/site-health');
    expect(routePath('/blog/index.html')).toBe('/blog');
  });

  it('keeps an on-demand route as the browser shows it', () => {
    expect(routePath('/pricing')).toBe('/pricing');
    expect(routePath('/pricing/')).toBe('/pricing');
  });
});
