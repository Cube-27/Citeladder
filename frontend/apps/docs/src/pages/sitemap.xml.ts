import { docsHref } from '@/lib/config/docs';
import { sitePages } from '../lib/site-pages';

export function GET() {
  const urls = sitePages.map(({ href }) => `<url><loc>${docsHref(href)}</loc></url>`).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    },
  );
}
