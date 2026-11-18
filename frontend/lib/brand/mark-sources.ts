import { logoDevUrl } from './logo-dev';

/**
 * The images a brand mark tries, in order: our cached logo (same-origin), then
 * the stored site's logo from the CDN. Empty only when the brand has neither,
 * which is the one case the letter stands in from the start.
 */
export function brandMarkSources({
  logoUrl,
  websiteUrl,
  pixels,
}: Readonly<{ logoUrl?: string | null; websiteUrl?: string | null; pixels: number }>): string[] {
  return [logoUrl || null, logoDevUrl(websiteUrl, pixels)].filter((src) => src !== null);
}
