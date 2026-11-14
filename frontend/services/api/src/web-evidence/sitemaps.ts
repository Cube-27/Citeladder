/**
 * Bounded sitemap parsing. Sitemaps are attacker-influenced XML: entity
 * declarations are refused outright, gzip expansion is capped before parsing,
 * each document's URLs are capped, and index recursion is depth-bounded and
 * loop-safe. This module only parses; the caller fetches each document.
 */
import { gunzipSync } from 'node:zlib';

import { XMLParser, XMLValidator } from 'fast-xml-parser';

export class SitemapParseError extends Error {}
/** A document over the decoded-byte cap: unread, not the server's answer that it has none. */
export class SitemapTooLargeError extends SitemapParseError {}
export type SitemapLimits = { maxDecodedBytes: number; maxUrls: number; maxIndexDepth: number };

const parser = new XMLParser({
  ignoreAttributes: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  removeNSPrefix: true,
  parseTagValue: false,
  htmlEntities: false,
  isArray: (name) => name === 'url' || name === 'sitemap',
});

/** Decompress a gzipped body under the decoded-byte cap; plain bodies pass through bounded. */
function sitemapBytes(body: Buffer, contentType: string, maxBytes: number) {
  const gzip = (body[0] === 0x1f && body[1] === 0x8b) || contentType.toLowerCase().includes('gzip');
  if (!gzip) {
    if (body.length > maxBytes)
      throw new SitemapTooLargeError('sitemap exceeds the decoded byte cap');
    return body;
  }
  try {
    return gunzipSync(body, { maxOutputLength: maxBytes });
  } catch (error) {
    if (error instanceof RangeError)
      throw new SitemapTooLargeError('gzip sitemap exceeds the decoded byte cap');
    throw new SitemapParseError('malformed gzip sitemap');
  }
}

const loc = (entry: unknown) =>
  entry && typeof entry === 'object' && 'loc' in entry && typeof entry.loc === 'string'
    ? entry.loc.trim()
    : '';
/** A W3C datetime is at most 29 characters; anything longer is kept bounded, not trusted. */
const MAX_LASTMOD_CHARS = 64;
const lastmodOf = (entry: unknown) =>
  entry && typeof entry === 'object' && 'lastmod' in entry && typeof entry.lastmod === 'string'
    ? entry.lastmod.trim().slice(0, MAX_LASTMOD_CHARS)
    : '';

/** Declared `<lastmod>` values by page URL; the first declaration of a URL wins. */
function lastmods(entries: unknown, maxUrls: number) {
  const declared = new Map<string, string>();
  for (const entry of (Array.isArray(entries) ? entries : []).slice(0, maxUrls)) {
    const url = loc(entry);
    const value = lastmodOf(entry);
    if (url && value && !declared.has(url)) declared.set(url, value);
  }
  return declared;
}

/**
 * One document: page URLs (and their declared `<lastmod>`) from a `<urlset>`,
 * child references from a `<sitemapindex>`.
 */
export function parseSitemap(body: Buffer, contentType: string, limits: SitemapLimits) {
  const text = sitemapBytes(body, contentType, limits.maxDecodedBytes).toString('utf8');
  if (/<!ENTITY/iu.test(text)) throw new SitemapParseError('sitemap declares entities');
  if (XMLValidator.validate(text) !== true) throw new SitemapParseError('malformed sitemap XML');
  const document: Record<string, unknown> = parser.parse(text);
  const [rootName, root] = Object.entries(document).find(([key]) => !key.startsWith('?')) ?? [];
  const isIndex = rootName?.toLowerCase() === 'sitemapindex';
  const children = root && typeof root === 'object' ? (root as Record<string, unknown>) : {};
  const all = (entries: unknown) =>
    (Array.isArray(entries) ? entries : []).map(loc).filter(Boolean);
  // A `<sitemap>` entry is a reference whichever root it appears under.
  const refs = all(children.sitemap);
  const urls = isIndex ? [] : all(children.url);
  const references = isIndex ? [...refs, ...all(children.url)] : refs;
  return {
    urls: urls.slice(0, limits.maxUrls),
    lastmod: isIndex ? new Map<string, string>() : lastmods(children.url, limits.maxUrls),
    refs: references.slice(0, limits.maxUrls),
    /** The document listed more URLs or references than the cap kept. */
    truncated: urls.length > limits.maxUrls || references.length > limits.maxUrls,
  };
}

export type SitemapDocument = ReturnType<typeof parseSitemap>;

/** A sitemap reference as one fetchable identity (WHATWG-normalized, no fragment), or null. */
export function sitemapRef(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

type CollectorOptions = {
  limits: SitemapLimits;
  /** The site-wide safety ceiling on collected URLs. */
  maxSiteUrls: number;
  /** Whether a child reference may be fetched; one that may not leaves the list short. */
  follows: (ref: string) => boolean;
};

/** A walk over one site's sitemap tree; it never fetches anything itself. */
export class SitemapCollector {
  readonly urls: string[] = [];
  /** Declared `<lastmod>` by collected URL, as the sitemap spells both. */
  readonly lastmod = new Map<string, string>();
  readonly #visited = new Set<string>();
  readonly limits: SitemapLimits;
  readonly #options: CollectorOptions;
  /** A limit, the depth bound or an unfollowed reference dropped URLs: a lower bound. */
  truncated = false;
  constructor(options: CollectorOptions) {
    this.limits = options.limits;
    this.#options = options;
  }
  /**
   * Ingest one parsed document (the caller parses, off the event loop); return
   * the unvisited child references it may follow within depth.
   */
  add(source: string, document: SitemapDocument, depth: number) {
    this.#visited.add(sitemapRef(source) ?? source);
    const room = Math.max(0, this.#options.maxSiteUrls - this.urls.length);
    const kept = document.urls.slice(0, room);
    if (document.truncated || kept.length < document.urls.length) this.truncated = true;
    // One push per URL: spreading a 50,000-URL document can overflow the call stack.
    for (const url of kept) this.urls.push(url);
    for (const url of kept) {
      const declared = document.lastmod.get(url);
      if (declared && !this.lastmod.has(url)) this.lastmod.set(url, declared);
    }
    const unseen = [...new Set(document.refs.flatMap((ref) => sitemapRef(ref) ?? []))].filter(
      (ref) => !this.#visited.has(ref),
    );
    const refs = unseen.filter((ref) => this.#options.follows(ref));
    if (refs.length < unseen.length) this.truncated = true;
    // Only an unread reference past the depth bound leaves the list short.
    if (depth >= this.limits.maxIndexDepth) {
      if (refs.length) this.truncated = true;
      return [];
    }
    return refs;
  }
}
