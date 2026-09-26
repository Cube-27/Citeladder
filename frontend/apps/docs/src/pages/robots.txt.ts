import { docsHref } from '@/lib/config/docs';

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${docsHref('/sitemap.xml')}\n`);
}
