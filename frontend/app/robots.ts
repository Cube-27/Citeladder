import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/seo/site';

/**
 * Route groups that must never be crawled: the signed-in app, onboarding, and
 * the API proxy. robots.txt group matching is most-specific-agent-wins, so a
 * named user-agent group does NOT inherit the `*` group — every group has to
 * carry this list or naming an agent silently opens the private surface to it.
 */
const PRIVATE_PATHS = [
  '/api/',
  '/onboarding',
  '/visibility',
  '/ai-referrals',
  '/traffic',
  '/prompts',
  '/products',
  '/runs',
  '/content',
  '/site',
  '/issues',
  '/opportunities',
  '/projects',
  '/settings',
];

/**
 * Answer-engine crawlers and the training/grounding opt-in tokens. Listing them
 * explicitly is the affirmative signal that the marketing surface — including
 * `/llms.txt` — is ours to quote; the private routes stay closed to them.
 */
const AI_CRAWLERS = [
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

/**
 * The marketing surface is crawlable; the signed-in app is not. The disallow
 * list mirrors the app route groups (`app/(app)` + onboarding) and the API.
 * The `sitemap:` directive needs an absolute URL, so it is emitted only once
 * a canonical origin exists (B3) — the file is valid without it.
 */
export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl('/sitemap.xml');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...PRIVATE_PATHS],
      },
      {
        userAgent: AI_CRAWLERS,
        allow: ['/', '/llms.txt', '/blog/', '/compare/'],
        disallow: [...PRIVATE_PATHS],
      },
    ],
    ...(sitemap ? { sitemap } : {}),
  };
}
