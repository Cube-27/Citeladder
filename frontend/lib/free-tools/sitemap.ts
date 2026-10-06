import { FREE_TOOL_LIMITS } from '@/lib/config/free-tools';
import { boundedText, webUrl } from './input';

function hasDeclarations(text: string) {
  let offset = 0;
  while (offset < text.length) {
    const start = text.indexOf('<!', offset);
    if (start < 0) return false;
    let terminator: string | null = null;
    if (text.startsWith('<!--', start)) terminator = '-->';
    else if (text.startsWith('<![CDATA[', start)) terminator = ']]>';
    if (terminator) {
      const end = text.indexOf(terminator, start + 4);
      if (end < 0) return false; // The XML parser rejects the unterminated subtree.
      offset = end + terminator.length;
    } else {
      if (/^<!(?:DOCTYPE|ENTITY)/i.test(text.slice(start, start + 9))) return true;
      offset = start + 2;
    }
  }
  return false;
}

function sitemapUrls(source: string) {
  const text = boundedText(source);
  if (hasDeclarations(text))
    throw new Error('Remove document type and entity declarations; these are not supported.');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror'))
    throw new Error('Invalid XML. Check that every tag is closed and ampersands are escaped.');
  const root = doc.documentElement;
  if (
    !['urlset', 'sitemapindex'].includes(root.localName) ||
    root.namespaceURI !== 'http://www.sitemaps.org/schemas/sitemap/0.9'
  )
    throw new Error('Use a sitemap urlset or sitemapindex with the sitemaps.org namespace.');
  const kind = root.localName === 'urlset' ? 'url' : 'sitemap';
  const entries = Array.from(root.children).filter((node) => node.localName === kind);
  if (entries.some((node) => node.namespaceURI !== root.namespaceURI))
    throw new Error('Every sitemap entry must use the sitemaps.org namespace.');
  if (entries.length > FREE_TOOL_LIMITS.sitemapUrls)
    throw new Error('Compare at most 10,000 URLs per file.');
  const urls = entries.map((entry) => {
    const locs = Array.from(entry.children).filter(
      (node) => node.localName === 'loc' && node.namespaceURI === root.namespaceURI,
    );
    if (locs.length !== 1 || !locs[0].textContent?.trim())
      throw new Error('Each entry must have exactly one nonempty loc element.');
    const value = locs[0].textContent.trim();
    webUrl(value);
    return value; // Preserve exact declared URLs, including meaningful slash/query differences.
  });
  return { kind, urls: new Set(urls), duplicates: urls.length - new Set(urls).size };
}

export function compareSitemaps(before: string, after: string) {
  const old = sitemapUrls(before);
  const next = sitemapUrls(after);
  if (old.kind !== next.kind)
    throw new Error('Compare two page sitemaps or two sitemap indexes, not one of each.');
  return {
    kind: old.kind,
    duplicates: old.duplicates + next.duplicates,
    added: [...next.urls].filter((url) => !old.urls.has(url)),
    removed: [...old.urls].filter((url) => !next.urls.has(url)),
    kept: [...next.urls].filter((url) => old.urls.has(url)),
  };
}
