// Submits marketing URLs to IndexNow after a deploy.
//
//   node scripts/ping-indexnow.mjs <built sitemap> [<previously live sitemap>]
//
// With a previous sitemap, only URLs that were added, removed or given a new
// <lastmod> are submitted; without one, every URL in the built sitemap is.
import { readFile } from 'node:fs/promises';
import { INDEXNOW_KEY } from '../lib/seo/indexnow.ts';

const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Each sitemap <loc> mapped to its <lastmod>, or '' when it has none. */
export function sitemapEntries(xml) {
  const entries = new Map();
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1]?.trim();
    if (!loc) continue;
    entries.set(
      loc.replaceAll('&amp;', '&'),
      /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1]?.trim() ?? '',
    );
  }
  return entries;
}

/** URLs added, removed or re-dated between two sitemaps. */
export function changedUrls(current, previous) {
  const changed = [...current].filter(([url, lastmod]) => previous.get(url) !== lastmod);
  const removed = [...previous.keys()].filter((url) => !current.has(url));
  return [...changed.map(([url]) => url), ...removed];
}

async function main([sitemapPath, previousPath]) {
  if (!sitemapPath) throw new Error('usage: ping-indexnow.mjs <sitemap> [<previous sitemap>]');
  const current = sitemapEntries(await readFile(sitemapPath, 'utf8'));
  const urls = previousPath
    ? changedUrls(current, sitemapEntries(await readFile(previousPath, 'utf8')))
    : [...current.keys()];
  if (urls.length === 0) {
    console.log('IndexNow: no changed URLs to submit.');
    return;
  }
  const origin = new URL(urls[0]);
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: origin.host,
      key: INDEXNOW_KEY,
      keyLocation: new URL(`/${INDEXNOW_KEY}.txt`, origin).toString(),
      urlList: urls,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`IndexNow answered ${response.status}: ${await response.text()}`);
  }
  console.log(`IndexNow accepted ${urls.length} URL(s) with status ${response.status}:`);
  for (const url of urls) console.log(`  ${url}`);
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
