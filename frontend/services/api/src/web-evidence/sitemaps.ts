/** Bounded sitemap documents and deterministic breadth-first admission. No network side effects. */
import { gunzipSync } from 'node:zlib';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { policy, resolveSettingSpec } from '../config.ts';
import { record } from '../db/json.ts';

class SitemapError extends Error {}
export function sitemapSettings(env: Record<string, string | undefined> = process.env) {
  const spec = policy.site_health.settings;
  return {
    bytes: Number(resolveSettingSpec(spec.max_sitemap_decoded_bytes, env)),
    urls: Number(resolveSettingSpec(spec.max_sitemap_urls, env)),
    depth: Number(resolveSettingSpec(spec.max_sitemap_index_depth, env)),
  };
}
export function parseSitemap(body: Buffer, contentType = '', settings = sitemapSettings({})) {
  let decoded = body;
  try {
    if ((body[0] === 0x1f && body[1] === 0x8b) || contentType.includes('gzip'))
      decoded = gunzipSync(body, { maxOutputLength: settings.bytes });
  } catch {
    throw new SitemapError('malformed or oversized gzip sitemap');
  }
  if (decoded.length > settings.bytes) throw new SitemapError('sitemap exceeded byte cap');
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml) || XMLValidator.validate(xml) !== true)
    throw new SitemapError('malformed or unsafe sitemap');
  const parser = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: true,
    isArray: (tag) => ['url', 'sitemap'].includes(tag),
  });
  const root = record(parser.parse(xml));
  const isIndex = 'sitemapindex' in root;
  const entries = record(root[isIndex ? 'sitemapindex' : 'urlset']);
  const urls: string[] = [];
  const refs: string[] = [];
  const seenUrls = new Set<string>();
  const seenRefs = new Set<string>();
  for (const key of ['url', 'sitemap']) {
    for (const raw of Array.isArray(entries[key]) ? entries[key] : []) {
      const location = record(raw).loc;
      if (typeof location !== 'string' || !location.trim()) continue;
      const bucket = isIndex || key === 'sitemap' ? refs : urls;
      const seen = bucket === refs ? seenRefs : seenUrls;
      const value = location.trim();
      if (bucket.length < settings.urls && !seen.has(value)) {
        seen.add(value);
        bucket.push(value);
      }
    }
  }
  return { urls, refs, isIndex };
}
export class SitemapCollector {
  readonly urls: string[] = [];
  readonly visited = new Set<string>();
  readonly #seen = new Set<string>();
  readonly settings: ReturnType<typeof sitemapSettings>;
  constructor(settings = sitemapSettings()) {
    this.settings = settings;
  }
  add(source: string, body: Buffer, depth: number, type = '') {
    this.visited.add(source);
    const doc = parseSitemap(body, type, this.settings);
    for (const url of doc.urls) {
      if (this.urls.length >= this.settings.urls) break;
      if (!this.#seen.has(url)) {
        this.#seen.add(url);
        this.urls.push(url);
      }
    }
    if (depth >= this.settings.depth || this.urls.length >= this.settings.urls) return [];
    return doc.refs.filter((ref) => {
      if (this.visited.has(ref)) return false;
      this.visited.add(ref);
      return true;
    });
  }
}
