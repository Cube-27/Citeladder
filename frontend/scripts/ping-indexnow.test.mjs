import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedUrls, sitemapEntries } from './ping-indexnow.mjs';

const sitemap = (...urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n${urls
    .map(([loc, lastmod]) =>
      lastmod
        ? `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
        : `  <url>\n    <loc>${loc}</loc>\n  </url>`,
    )
    .join('\n')}\n</urlset>\n`;

test('submits only URLs that were added, removed or re-dated since the live sitemap', () => {
  const previous = sitemapEntries(
    sitemap(
      ['https://example.com/', null],
      ['https://example.com/blog/a', '2026-01-01'],
      ['https://example.com/blog/b', '2026-01-01'],
      ['https://example.com/retired', null],
    ),
  );
  const current = sitemapEntries(
    sitemap(
      ['https://example.com/', null],
      ['https://example.com/blog/a', '2026-01-01'],
      ['https://example.com/blog/b', '2026-02-01'],
      ['https://example.com/blog/c?x=1&amp;y=2', null],
    ),
  );

  assert.deepEqual(changedUrls(current, previous), [
    'https://example.com/blog/b',
    'https://example.com/blog/c?x=1&y=2',
    'https://example.com/retired',
  ]);
});

test('submits nothing when the sitemap is unchanged', () => {
  const live = sitemapEntries(sitemap(['https://example.com/', '2026-01-01']));
  assert.deepEqual(changedUrls(live, live), []);
});
