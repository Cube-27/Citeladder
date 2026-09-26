import { docsHref } from '@/lib/config/docs';
import { articles } from '../lib/content';

export function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${articles.map(({ href }) => `<url><loc>${docsHref(href)}</loc></url>`).join('')}</urlset>`,
    {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    },
  );
}
