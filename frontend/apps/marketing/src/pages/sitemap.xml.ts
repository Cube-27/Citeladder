import { POSTS } from '@/lib/marketing-content/blog';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import { FOOTER_LEGAL_LINKS } from '@/lib/marketing-content/legal';
import { absoluteUrl } from '@/lib/seo/site';

type RouteEntry = {
  path: string;
  changeFrequency: 'monthly' | 'weekly' | 'yearly';
  priority: number;
  lastModified?: string;
};

const staticRoutes: readonly RouteEntry[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/enterprise', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/solutions', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/blog', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/compare', changeFrequency: 'monthly', priority: 0.6 },
];

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function GET() {
  const routes: RouteEntry[] = [
    ...staticRoutes,
    ...POSTS.map((post) => ({
      path: `/blog/${post.slug}`,
      changeFrequency: 'yearly' as const,
      priority: 0.7,
      lastModified: post.dateModified ?? post.date,
    })),
    ...COMPETITORS.map((competitor) => ({
      path: `/compare/${competitor.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...FOOTER_LEGAL_LINKS.map((link) => ({
      path: link.href,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
  const entries = routes
    .map(({ path, changeFrequency, priority, lastModified }) => {
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
    })
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
