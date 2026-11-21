import { publicOrigins } from '@/lib/config/public-origins';

export const SITE_NAME = 'CiteLadder';
export const SITE_TAGLINE = 'AI visibility with evidence you can open';
export const SITE_DESCRIPTION =
  'Connect site and demand evidence, act on grounded opportunities, and track observed answer-engine citation share.';
export const DEFAULT_SOCIAL_IMAGE = {
  path: '/social/citeladder.png',
  alt: 'CiteLadder: AI visibility with evidence you can open',
} as const;

export function organizationReference(home: string): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': new URL('#organization', home).toString(),
    name: SITE_NAME,
    url: home,
  };
}

export function siteOrigin(): URL | null {
  return publicOrigins().website;
}

export function absoluteUrl(path: string): string | null {
  const origin = siteOrigin();
  if (!origin) return null;
  return new URL(path, origin).toString();
}
