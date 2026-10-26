import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { GET as llms } from './pages/llms.txt';
import { GET as sitemap } from './pages/sitemap.xml';

beforeEach(() => {
  vi.stubEnv('PUBLIC_WEBSITE_ORIGIN', 'https://example.com');
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.example.com');
});
afterEach(() => vi.unstubAllEnvs());

describe('public route listings', () => {
  it('lists every sitemap page in llms.txt as a named link, and nothing on the site that the sitemap omits', async () => {
    const locations = [...(await sitemap().text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, url]) => url!,
    );
    const links = [...(await llms().text()).matchAll(/^- \[(.+)\]\((.+)\)$/gm)].map(
      ([, title, url]) => ({ title: title!, url: url! }),
    );

    expect(new Set(locations).size).toBe(locations.length);
    const siteLinks = links.filter((link) => new URL(link.url).host === 'example.com');
    expect(siteLinks.map((link) => link.url).sort()).toEqual([...locations].sort());
    expect(locations).toContain('https://example.com/tools/robots-txt-generator');
    expect(locations).toContain('https://example.com/generative-engine-optimization');
    for (const link of links) expect(link.title, link.url).not.toBe(link.url);
  });

  it('dates every sitemap page, and each index page no earlier than the pages it lists', async () => {
    const entries = [
      ...(await sitemap().text()).matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+))?/g),
    ].map(([, url, lastmod]) => ({ path: new URL(url!).pathname, lastmod }));

    for (const { path, lastmod } of entries) expect(lastmod, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dated = new Map(entries.map(({ path, lastmod }) => [path, lastmod!]));
    for (const index of ['/blog', '/compare', '/tools']) {
      const children = entries.filter(({ path }) => path.startsWith(`${index}/`));
      expect(children.length, index).toBeGreaterThan(0);
      for (const child of children)
        expect(dated.get(index)! >= child.lastmod!, child.path).toBe(true);
    }
  });
});
