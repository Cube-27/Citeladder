import { absoluteUrl } from '@/lib/seo/site';

const privateSegments = [
  'onboarding',
  'ai-traffic',
  'content',
  'demand',
  'issues',
  'opportunities',
  'performance',
  'products',
  'projects',
  'prompts',
  'runs',
  'settings',
  'site',
  'visibility',
];
// Match route boundaries so /site stays private without blocking /sitemap.xml.
const privatePaths = [
  '/api/',
  ...privateSegments.flatMap((segment) => [`/${segment}$`, `/${segment}/`, `/${segment}?`]),
];
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

const rule = (userAgent: string, allow: readonly string[]) =>
  [
    `User-agent: ${userAgent}`,
    'Content-Signal: search=yes, ai-input=yes, ai-train=no',
    ...allow.map((path) => `Allow: ${path}`),
    ...privatePaths.map((path) => `Disallow: ${path}`),
  ].join('\n');

export function GET() {
  const sitemap = absoluteUrl('/sitemap.xml');
  const lines = [
    rule('*', ['/']),
    rule(aiCrawlers.join('\nUser-agent: '), ['/', '/llms.txt', '/blog/', '/compare/']),
    sitemap ? `Sitemap: ${sitemap}` : null,
  ].filter((line): line is string => line !== null);
  return new Response(`${lines.join('\n\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
