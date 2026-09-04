import { getSiteUrl } from '@/lib/config/env';

/**
 * Canonical public origin. `NEXT_PUBLIC_SITE_URL` wins wherever it is set; a
 * production build without it falls back to the approved apex so canonicals,
 * `metadataBase`, the `sitemap:` directive and the JSON-LD blocks are always
 * emitted on the live site. Dev and test still resolve to null, so every
 * consumer keeps degrading instead of guessing a localhost origin.
 * Validation mirrors the demo page's `safeBookingUrl`: `new URL()` in a try,
 * https-only, no credentials.
 */

export const SITE_NAME = 'CiteLadder';
export const SITE_TAGLINE = 'AI visibility with evidence you can open';
/** One-sentence product description. Single source for metadata and JSON-LD. */
export const SITE_DESCRIPTION =
  'Connect site and demand evidence, act on grounded opportunities, and track observed answer-engine citation share.';

const CANONICAL_SITE_URL = 'https://citeladder.com';

/** Parses NEXT_PUBLIC_SITE_URL, falling back to the canonical apex in production. */
export function siteOrigin(): URL | null {
  const value = getSiteUrl() || (process.env.NODE_ENV === 'production' ? CANONICAL_SITE_URL : null);
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/** Absolute URL for a site path, or null while no canonical origin is configured. */
export function absoluteUrl(path: string): string | null {
  const origin = siteOrigin();
  if (!origin) return null;
  return new URL(path, origin).toString();
}
