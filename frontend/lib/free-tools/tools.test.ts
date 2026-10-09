import { describe, expect, it } from 'vite-plus/test';
import { testRobots, generateRobots } from './robots';
import { inspectMarkup } from './markup';
import { compareSitemaps } from './sitemap';
import { buildSchema, socialTags } from './generators';
import { boundedText, webUrl } from './input';

const bots = [
  { label: 'Search', purpose: 'ai_search', tokens: ['OAI-SearchBot'] },
  { label: 'Training', purpose: 'ai_training', tokens: ['GPTBot'] },
];
const sitemap = (items: string[], kind = 'urlset') =>
  `<${kind} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.map((url) => `<${kind === 'urlset' ? 'url' : 'sitemap'}><loc>${url}</loc></${kind === 'urlset' ? 'url' : 'sitemap'}>`).join('')}</${kind}>`;

describe('browser tool transformations', () => {
  it('distinguishes purpose-specific rules, longest matches and line evidence', () => {
    const body =
      'User-agent: *\nDisallow: /private/\nAllow: /private/guide$\nUser-agent: GPTBot\nDisallow: /';
    const result = testRobots(body, 'https://example.com/private/guide', bots);
    expect(result[0]).toMatchObject({
      status: 'Allowed by supplied rules',
      evidence: 'Line 3: Allow: /private/guide$',
    });
    expect(result[1]?.status).toBe('Blocked by supplied rules');
    expect(testRobots(body, 'https://example.com/private/guide/more', bots)[0]?.status).toBe(
      'Blocked by supplied rules',
    );
  });
  it('generates training blocks without overriding shared exclusions for search', () => {
    const body = generateRobots(bots, ['GPTBot'], '/private/', 'https://example.com/sitemap.xml');
    expect(testRobots(body, 'https://example.com/public', bots).map((row) => row.status)).toEqual([
      'Allowed by supplied rules',
      'Blocked by supplied rules',
    ]);
    expect(testRobots(body, 'https://example.com/private/x', bots)[0]?.status).toBe(
      'Blocked by supplied rules',
    );
    expect(() => generateRobots(bots, [], 'User-agent: *', '')).toThrow();
    expect(() => testRobots('<html>Access denied</html>', 'https://example.com', bots)).toThrow();
    expect(
      testRobots('# Crawl policy\n  # No restrictions', 'https://example.com', bots)[0]?.status,
    ).toBe('Allowed by supplied rules');
  });
  it('preserves directive scope and reports absent headers as unknown', () => {
    const result = inspectMarkup(
      '<meta name="robots" content="index"><meta name="googlebot" content="noindex"><link rel="canonical" href="/a"><link rel="canonical" href="/b">',
      '',
    );
    expect(result).toContain('googlebot: noindex');
    expect(result).toContain('Multiple canonical declarations');
    expect(result).toContain('X-Robots-Tag is unknown');
    const withHeaders = inspectMarkup(
      '',
      'X-Robots-Tag: none\nLink: <https://example.com>; rel="canonical"',
    );
    expect(withHeaders).toContain('An indexing restriction is declared');
    expect(withHeaders).toContain('Link: <https://example.com>');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(inspectMarkup('<meta name="googlebot-news" content="noindex">', '')).toContain(
      'googlebot-news: noindex',
    );
  });
  it('compares exact sitemap URLs and deduplicates without crawling indexes', () => {
    const result = compareSitemaps(
      sitemap(['https://example.com/a', 'https://example.com/a', 'https://example.com/b']),
      sitemap(['https://example.com/a/', 'https://example.com/b']),
    );
    expect(result).toMatchObject({
      added: ['https://example.com/a/'],
      removed: ['https://example.com/a'],
      kept: ['https://example.com/b'],
      duplicates: 1,
    });
    expect(() => compareSitemaps(sitemap([], 'sitemapindex'), sitemap([]))).toThrow(
      /not one of each/,
    );
    expect(() => compareSitemaps('<urlset>', sitemap([]))).toThrow(/Invalid XML/);
    expect(() => compareSitemaps(sitemap(['javascript:alert(1)']), sitemap([]))).toThrow();
    expect(() => compareSitemaps('<!DOCTYPE x><urlset/>', sitemap([]))).toThrow(/entity/);
    expect(
      compareSitemaps(`<!-- <!DOCTYPE is just a comment -->${sitemap([])}`, sitemap([])),
    ).toMatchObject({
      added: [],
      removed: [],
    });
    const wrongNamespace =
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url xmlns=""><loc>https://example.com/lost</loc></url></urlset>';
    expect(() => compareSitemaps(wrongNamespace, sitemap([]))).toThrow(/namespace/);
  });
  it('exports safely embedded JSON-LD, real dates and ordered breadcrumb entities', () => {
    const html = buildSchema(
      'Article',
      '</script><img src=x>',
      'https://example.com/a',
      'Alex',
      '2026-10-06',
    );
    const template = document.createElement('template');
    template.innerHTML = html;
    expect(template.content.querySelector('img')).toBeNull();
    const parsed = JSON.parse(template.content.querySelector('script')!.textContent!);
    expect(parsed.headline).toBe('</script><img src=x>');
    expect(() =>
      buildSchema('Article', 'Title', 'https://example.com', 'Alex', '2026-02-30'),
    ).toThrow(/date/);
    const breadcrumb = buildSchema(
      'BreadcrumbList',
      '',
      '',
      'Home | https://example.com\nGuide | https://example.com/guide',
      '',
    );
    template.innerHTML = breadcrumb;
    expect(
      JSON.parse(template.content.querySelector('script')!.textContent!).itemListElement[1],
    ).toMatchObject({ position: 2, name: 'Guide', item: 'https://example.com/guide' });
  });
  it('escapes social attributes and rejects executable URLs and oversized input', () => {
    const tags = socialTags('A "quoted" <title>', 'A & B', 'https://example.com', '', '');
    const template = document.createElement('template');
    template.innerHTML = tags;
    expect(
      template.content.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ).toBe('A "quoted" <title>');
    expect(() => webUrl('javascript:alert(1)')).toThrow();
    expect(() => webUrl('https://name:secret@example.com')).toThrow();
    expect(() => boundedText('x'.repeat(200_001))).toThrow(/exceeds/);
  });
});
