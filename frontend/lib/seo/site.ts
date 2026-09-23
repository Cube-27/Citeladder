import { publicOrigins } from '@/lib/config/public-origins';

/**
 * Canonical website origin for metadata, sitemap and JSON-LD. Production
 * requires an explicit configured origin; development may omit it.
 */

export const SITE_NAME = 'CiteLadder';
export const SITE_TAGLINE = 'AI visibility with evidence you can open';
/** One-sentence product description. Single source for metadata and JSON-LD. */
export const SITE_DESCRIPTION =
  'Connect site and demand evidence, act on grounded opportunities, and track observed answer-engine citation share.';

/** Canonical website origin supplied by the public-origin config owner. */
export function siteOrigin(): URL | null {
  return publicOrigins().website;
}

/** Absolute URL for a site path, or null while no canonical origin is configured. */
export function absoluteUrl(path: string): string | null {
  const origin = siteOrigin();
  if (!origin) return null;
  return new URL(path, origin).toString();
}
