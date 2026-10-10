import { POSTS } from '@/lib/marketing-content/blog';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import { FOOTER_LEGAL_LINKS } from '@/lib/marketing-content/legal';
import { PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';
import { FREE_TOOLS } from '@/lib/marketing-content/tools';
import { RESEARCH_ARTICLES } from './research-articles';

type ChangeFrequency = 'monthly' | 'weekly' | 'yearly';

export type PublicRoute = {
  path: string;
  title: string;
  /** Policies are listed apart from product and guide pages in llms.txt. */
  kind: 'page' | 'policy';
  changeFrequency: ChangeFrequency;
  priority: number;
  lastModified?: string;
};

const page = (
  path: string,
  title: string,
  changeFrequency: ChangeFrequency,
  priority: number,
  lastModified?: string,
): PublicRoute => ({ path, title, kind: 'page', changeFrequency, priority, lastModified });

/**
 * Every indexable marketing page, once. The sitemap and llms.txt both read this
 * list, so a page published to one is published to the other.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  page('/', 'CiteLadder', 'weekly', 1),
  ...PUBLISHED_PLATFORM.map((item) => page(item.href, item.title, 'monthly', 0.8)),
  page('/pricing', 'Pricing', 'monthly', 0.9),
  page('/enterprise', 'Enterprise', 'monthly', 0.8),
  page('/solutions', 'Solutions', 'monthly', 0.8),
  page('/ai-search-share-of-voice', 'AI search share of voice', 'monthly', 0.8),
  page('/faq', 'FAQ', 'monthly', 0.6),
  page('/ai-instructions', 'AI Instructions', 'monthly', 0.5),
  page('/entity-map', 'Entity Map', 'monthly', 0.5),
  page('/blog', 'Blog', 'weekly', 0.6),
  ...RESEARCH_ARTICLES.map(({ frontmatter }) =>
    page(frontmatter.slug, frontmatter.title, 'yearly', 0.7),
  ),
  ...POSTS.map((post) =>
    page(`/blog/${post.slug}`, post.title, 'yearly', 0.7, post.dateModified ?? post.date),
  ),
  page('/compare', 'Compare AI visibility tools', 'monthly', 0.6),
  ...COMPETITORS.map((competitor) =>
    page(`/compare/${competitor.slug}`, `CiteLadder vs ${competitor.name}`, 'monthly', 0.5),
  ),
  page('/tools', 'Free tools', 'monthly', 0.8),
  ...FREE_TOOLS.map((tool) => page(`/tools/${tool.slug}`, tool.title, 'monthly', 0.7)),
  ...FOOTER_LEGAL_LINKS.map((link) => ({
    ...page(link.href, link.label, 'yearly', 0.3),
    kind: 'policy' as const,
  })),
];
