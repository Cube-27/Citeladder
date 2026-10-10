import { absoluteUrl } from '@/lib/seo/site';
import { PUBLIC_ROUTES } from '../public-routes';

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function GET() {
  const entries = PUBLIC_ROUTES.map(({ path, changeFrequency, priority, lastModified }) => {
    const url = absoluteUrl(path) ?? path;
    return [
      '  <url>',
      `    <loc>${escapeXml(url)}</loc>`,
      lastModified ? `    <lastmod>${escapeXml(lastModified)}</lastmod>` : null,
      `    <changefreq>${changeFrequency}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
