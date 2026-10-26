import { absoluteUrl } from '@/lib/seo/site';

// Retired app paths are not disallowed: the apex answers them with 404, and a
// crawler has to fetch a URL to see that it is gone.
const privatePaths = ['/api/'];
const aiCrawlers = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
];

const rule = (userAgents: readonly string[]) =>
  [
    ...userAgents.map((userAgent) => `User-agent: ${userAgent}`),
    'Allow: /',
    ...privatePaths.map((path) => `Disallow: ${path}`),
  ].join('\n');

export function GET() {
  const sitemap = absoluteUrl('/sitemap.xml');
  const lines = [sitemap ? `Sitemap: ${sitemap}` : null, rule(['*']), rule(aiCrawlers)].filter(
    (line): line is string => line !== null,
  );
  return new Response(`${lines.join('\n\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
