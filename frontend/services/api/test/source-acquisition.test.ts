import { gzipSync } from 'node:zlib';
import { expect, it, vi } from 'vitest';

import { createWebsiteFetcher, decodedBody, FetchError } from '../src/projects/safe-fetch.ts';
import {
  acquisitionSettings,
  HostPacer,
  PageAcquirer,
  robotsPolicy,
} from '../src/web-evidence/acquisition.ts';
import { parseSitemap, SitemapCollector } from '../src/web-evidence/sitemaps.ts';
import { extractSourcePage } from '../src/source-pages/extract.ts';
import { assessPage, urlFormat } from '../src/source-pages/assessment.ts';
import { compareContent, type ComparisonPage } from '../src/source-pages/differentiation.ts';
import { canonicalIdentity, citationIdentity } from '../src/site-health/url-identity.ts';
import { policy } from '../src/config.ts';
import { organicResults } from '../src/source-pages/sync.ts';

const settings = { ...acquisitionSettings({}), defaultDelay: 0, maxDelay: 1, timeout: 0.02 };
const options = {
  maxBytes: 10000,
  timeoutSeconds: 0.02,
  redirects: 3,
  contentTypes: ['text/html'],
};
it.each(['https://first.test/private', 'https://second.test/private'])(
  'checks destination robots before downloading the redirected page %s',
  async (destination) => {
    const sent: string[] = [];
    const fetcher = createWebsiteFetcher(
      async () => [{ address: '93.184.216.34', family: 4 }],
      async (url) => {
        sent.push(url.href);
        return url.pathname === '/robots.txt'
          ? {
              status: 200,
              location: undefined,
              type: 'text/plain',
              body: Buffer.from('User-agent: *\nDisallow: /private'),
            }
          : { status: 302, location: destination, type: '', body: Buffer.alloc(0) };
      },
    );
    const acquirer = new PageAcquirer(async () => {}, fetcher, settings, 0);
    await expect(acquirer.fetch('https://first.test/', options)).rejects.toMatchObject({
      code: 'robots_disallowed',
    });
    expect(sent).not.toContain(destination);
  },
);
it('applies crawler-specific robots rules, longest allow, refusal and retryable unavailability', () => {
  const body =
    'User-agent: *\nDisallow: /private\nAllow: /private/public\nSitemap: https://example.test/map.xml';
  const policy = robotsPolicy('https://example.test', 200, body, settings);
  expect(policy.permits('https://example.test/private')).toBe(false);
  expect(policy.permits('https://example.test/private/public')).toBe(true);
  expect(policy.sitemaps).toEqual(['https://example.test/map.xml']);
  expect(
    robotsPolicy('https://example.test', 404, '', settings).permits('https://example.test/'),
  ).toBe(true);
  expect(robotsPolicy('https://example.test', 503, '', settings).unavailable).toBe(true);
  expect(
    robotsPolicy('https://example.test', 403, '', settings).permits('https://example.test/'),
  ).toBe(false);
  expect(
    robotsPolicy('https://example.test', 200, 'User-agent: *\nCrawl-delay: 2', settings).permits(
      'https://example.test/',
    ),
  ).toBe(false);
});
it('coalesces robots acquisition and checks destination robots and suppression before redirected DNS', async () => {
  const dns = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
  const sent: string[] = [];
  let stopped = false;
  const fetcher = createWebsiteFetcher(dns, async (url) => {
    sent.push(url.href);
    if (url.pathname === '/robots.txt')
      return {
        status: 200,
        location: undefined,
        type: 'text/plain',
        body: Buffer.from('User-agent: *\nAllow: /'),
      };
    if (url.hostname === 'first.test') {
      stopped = true;
      return { status: 302, location: 'https://second.test/page', type: '', body: Buffer.alloc(0) };
    }
    return {
      status: 200,
      location: undefined,
      type: 'text/html',
      body: Buffer.from('<p>Reading</p>'),
    };
  });
  const authorize = vi.fn(async (url: URL) => {
    if (stopped && url.hostname === 'second.test') throw new FetchError('acquisition_unavailable');
  });
  const acquirer = new PageAcquirer(authorize, fetcher, settings, 0);
  await Promise.all([acquirer.robots('https://first.test'), acquirer.robots('https://first.test')]);
  await expect(acquirer.fetch('https://first.test/page', options)).rejects.toMatchObject({
    code: 'robots_unavailable',
  });
  expect(sent).toEqual(['https://first.test/robots.txt', 'https://first.test/page']);
  expect(dns).toHaveBeenCalledTimes(2);
});
it('refuses a redirect to a private address after checking its own robots', async () => {
  const sent: string[] = [];
  const fetcher = createWebsiteFetcher(
    async (host) => [
      { address: host === 'private.test' ? '127.0.0.1' : '93.184.216.34', family: 4 },
    ],
    async (url) => {
      sent.push(url.href);
      return url.pathname === '/robots.txt'
        ? { status: 404, location: undefined, type: '', body: Buffer.alloc(0) }
        : { status: 302, location: 'https://private.test/page', type: '', body: Buffer.alloc(0) };
    },
  );
  const acquirer = new PageAcquirer(async () => {}, fetcher, settings, 0);
  await expect(acquirer.fetch('https://first.test/page', options)).rejects.toMatchObject({
    code: 'robots_unavailable',
  });
  expect(sent).toEqual(['https://first.test/robots.txt', 'https://first.test/page']);
});
it('starts a hop timeout after its host slot and aborts an unresolved DNS lookup', async () => {
  let release!: () => void;
  const pacer = new HostPacer();
  const held = pacer.slot(
    'https://example.test',
    0,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const send = vi.fn(async () => ({
    status: 200,
    location: undefined,
    type: 'text/html',
    body: Buffer.from('ok'),
  }));
  const fetcher = createWebsiteFetcher(async () => [{ address: '93.184.216.34', family: 4 }], send);
  const result = fetcher('https://example.test/', {
    ...options,
    gate: (url, dispatch, signal) => pacer.slot(url.origin, 0, dispatch, signal),
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 35);
  });
  release();
  await held;
  expect((await result).body.toString()).toBe('ok');
  const stalled = createWebsiteFetcher(async () => new Promise(() => {}), send);
  await expect(stalled('https://example.test/', options)).rejects.toMatchObject({
    name: 'TimeoutError',
  });
});
it('enforces compressed byte caps and parses escaped locations without permitting XML declarations', () => {
  const body = Buffer.from(
    '<urlset xmlns="urn:sitemap"><url><loc>https://example.test/?a=1&amp;b=2</loc></url></urlset>',
  );
  expect(parseSitemap(gzipSync(body)).urls).toEqual(['https://example.test/?a=1&b=2']);
  expect(() =>
    parseSitemap(Buffer.from('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><urlset/>')),
  ).toThrow();
  expect(() => parseSitemap(Buffer.from('<urlset>'))).toThrow();
  expect(() => decodedBody(gzipSync(Buffer.alloc(10000)), 'gzip', 100)).toThrow(
    'response_too_large',
  );
  expect(() =>
    parseSitemap(gzipSync(Buffer.alloc(10000)), 'gzip', { bytes: 100, depth: 1, urls: 3 }),
  ).toThrow();
});
it('deduplicates sitemap cycles and bounds depth and admitted URLs', () => {
  const collector = new SitemapCollector({ bytes: 1000, depth: 1, urls: 2 });
  const refs = collector.add(
    'https://example.test/map',
    Buffer.from(
      '<sitemapindex><sitemap><loc>https://example.test/child</loc></sitemap><sitemap><loc>https://example.test/map</loc></sitemap></sitemapindex>',
    ),
    0,
  );
  expect(refs).toEqual(['https://example.test/child']);
  collector.add(
    refs[0]!,
    Buffer.from(
      '<urlset><url><loc>a</loc></url><url><loc>a</loc></url><url><loc>b</loc></url><url><loc>c</loc></url></urlset>',
    ),
    1,
  );
  expect(collector.urls).toEqual(['a', 'b']);
});
it('extracts visible evidence and keeps schema, headings and table structure separate', () => {
  const page = extractSourcePage(
    Buffer.from(
      '<html><head><title>Review</title><script type="application/ld+json">{"@type":"Review"}</script></head><body><h1>Acme review</h1><p>Acme is measured here.</p><script>Hidden Rival</script><table><tr><th>Cost</th></tr></table></body></html>',
    ),
  );
  const result = assessPage(page, { brand_name: 'Acme', competitors: [{ name: 'Rival' }] });
  expect(result.format).toBe('review');
  expect(result.presences.map((row) => row.presence)).toEqual(['present', 'partial']);
  expect(result.passages[0]?.text).toContain('Acme');
  expect(page.text).not.toContain('Hidden Rival');
  expect(page.facts.table_headers).toEqual([['Cost']]);
  expect(extractSourcePage(Buffer.from('<p>Visible without a title</p>')).facts.title).toBe('');
});
it('distinguishes literal presence, normalization ambiguity, and sufficient untruncated absence', () => {
  const partial = extractSourcePage(Buffer.from('<p>A &amp; B uses a tool</p>'));
  expect(assessPage(partial, { brand_name: 'A and B' }).presences[0]?.presence).toBe('ambiguous');
  const full = extractSourcePage(Buffer.from(`<p>${'Other words '.repeat(100)}</p>`));
  expect(assessPage(full, { brand_name: 'Acme' }).presences[0]?.presence).toBe('not_detected');
  expect(
    assessPage({ ...full, facts: { ...full.facts, text_truncated: true } }, { brand_name: 'Acme' })
      .presences[0]?.presence,
  ).toBe('partial');
  expect(assessPage(full, {}).presences).toEqual([]);
});
it('derives page formats from a page address and keeps redirect tokens unresolved', () => {
  expect(urlFormat('https://example.test/compare/tools').format).toBe('comparison');
  expect(
    citationIdentity('https://vertexaisearch.cloud.google.com/grounding-api-redirect/token'),
  ).toBeNull();
  expect(
    canonicalIdentity('https://EXAMPLE.test:443/%7euser?utm_source=x&b=2&a=1#section').url,
  ).toBe('https://example.test/~user?a=1&b=2');
});
it('compares page-level feature sets with explicit inspected denominators and unknown evidence', () => {
  const page = (id: string, headings: string[]): ComparisonPage => ({
    id,
    headings,
    tables: [['Price']],
    domains: [],
  });
  const compared = [
    page('1', ['Acme pricing', 'Tool features']),
    page('2', ['Acme pricing', 'Tool features']),
    page('3', ['Other topic']),
  ];
  const result = compareContent(
    page('own', ['Acme pricing', 'Unique insight']),
    compared,
    ['1', '2', '3', '4'],
    ['s1', 's2', 's3'],
    {},
  );
  expect(result.parity).toContainEqual(
    expect.objectContaining({ value: 'acme pricing', observed_pages: 2, inspected_pages: 3 }),
  );
  expect(result.gaps).toContainEqual(expect.objectContaining({ value: 'features tool' }));
  expect(result.unique_contributions).toContainEqual(
    expect.objectContaining({ value: 'insight unique' }),
  );
  expect(result.provenance.unusable_page_count).toBe(1);
  expect(compareContent(null, compared, ['1', '2', '3'], [], {}).state).toBe(
    'insufficient_evidence',
  );
});
it('uses publisher schema before headings and ignores nested entity types and hostile blocks', () => {
  const body = `<title>Best tools</title><script type="application/ld+json">${'['.repeat(20000)}${']'.repeat(20000)}</script>
    <script type="application/ld+json">{"@type":"https://schema.org/NewsArticle","publisher":{"@type":"Organization"}}</script><h1>Best tools</h1><p>Acme leads.</p>`;
  const result = assessPage(extractSourcePage(Buffer.from(body)), { brand_name: 'Acme' });
  expect(result).toMatchObject({ format: 'article', method: 'structured_data' });
  expect(
    assessPage(extractSourcePage(Buffer.from('<h1>Versatile topical notes</h1>')), {}).format,
  ).toBe('unresolved');
});
it('bounds quotations and abstains when a literal verdict has no retained quote', () => {
  const page = extractSourcePage(
    Buffer.from(`<h1>Acme tools</h1><p>${'Acme leads. Rival follows. '.repeat(100)}</p>`),
  );
  const result = assessPage(page, {
    brand_name: 'Acme',
    competitors: [{ name: 'Rival' }, { name: 'AI' }],
  });
  expect(result.passages).toHaveLength(policy.source_pages.max_passages);
  expect(
    result.passages.every((passage) => passage.text.length <= policy.source_pages.passage_chars),
  ).toBe(true);
  expect(result.presences.map((presence) => presence.presence)).toEqual([
    'present',
    'ambiguous',
    'not_detected',
  ]);
  expect(
    assessPage(
      extractSourcePage(Buffer.from(`<p>${'Acmetron supplies other tools. '.repeat(100)}</p>`)),
      { brand_name: 'Acme' },
    ).presences[0]?.presence,
  ).toBe('not_detected');
});
it('hashes prose and declared structure while ignoring markup noise and rotating outbound destinations', () => {
  const page = (text: string, href: string, type: string) =>
    extractSourcePage(
      Buffer.from(
        `<script type="application/ld+json">{"@type":"${type}"}</script><p>${text}</p><a href="${href}">Source</a>`,
      ),
    );
  const first = page('Acme leads.', 'https://one.com/a', 'Article');
  expect(first.content_hash).toBe(
    page('<span>Acme leads.</span>', 'https://two.com/b', 'Article').content_hash,
  );
  expect(first.content_hash).not.toBe(
    page('Acme follows.', 'https://one.com/a', 'Article').content_hash,
  );
  expect(first.content_hash).not.toBe(
    page('Acme leads.', 'https://one.com/a', 'ItemList').content_hash,
  );
  const truncated = extractSourcePage(
    Buffer.from(`<p>${'a'.repeat(policy.source_pages.max_text_chars + 1)}</p>`),
  );
  expect(truncated.facts.text_truncated).toBe(true);
  expect(truncated.extracted_chars).toBe(policy.source_pages.max_text_chars);
  expect('text' in truncated.facts).toBe(false);
});
it('ranks organic results while skipping unusable ranks and raw duplicate URLs', () => {
  const result = organicResults({
    result: [
      {
        items: [
          { type: 'organic', url: 'https://example.test/second', rank_absolute: 2 },
          { type: 'organic', url: 'https://example.test/first', rank_absolute: 1 },
          { type: 'organic', url: 'https://example.test/first', rank_absolute: 3 },
          { type: 'organic', url: 'https://example.test/bad', rank_absolute: 'invalid' },
          { type: 'paid', url: 'https://example.test/ad', rank_absolute: 1 },
        ],
      },
    ],
  });
  expect(result.map((item) => item.url)).toEqual([
    'https://example.test/first',
    'https://example.test/second',
  ]);
});
it.each([
  ['/', 'homepage'],
  ['/us/blog/revolut-vs-wise', 'comparison'],
  ['/vs/wise', 'comparison'],
  ['/wise/vs', 'comparison'],
  ['/alternatives/revolut', 'alternative'],
  ['/how-to-send-money', 'how_to'],
  ['/best-credit-cards', 'listicle'],
  ['/r/fintech/comments/abc/title', 'discussion'],
  ['/pricing.html', 'product'],
  ['/category/banking', 'category'],
  ['/collections/best-sellers', 'category'],
  ['/collections/best-selling-mugs', 'category'],
  ['/2024/05/chip-item-shortage', 'article'],
  ['/versatile-tools', 'unresolved'],
  ['/a-p-q', 'unresolved'],
])('classifies the cited path %s from URL evidence as %s', (path, expected) => {
  expect(urlFormat(`https://example.test${path}`).format).toBe(expected);
});
