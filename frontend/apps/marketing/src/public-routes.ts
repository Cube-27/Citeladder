import { POSTS } from '@/lib/marketing-content/blog';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import { FOOTER_LEGAL_LINKS } from '@/lib/marketing-content/legal';
import { PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';
import { FREE_TOOLS } from '@/lib/marketing-content/tools';
import { RESEARCH_ARTICLES } from './research-articles';

export type PublicRoute = {
  path: string;
  title: string;
  /** Policies are listed apart from product and guide pages in llms.txt. */
  kind: 'page' | 'policy';
  changeFrequency: 'monthly' | 'weekly' | 'yearly';
  priority: number;
  lastModified?: string;
};

/**
 * Every indexable marketing page, once. The sitemap and llms.txt both read this
 * list, so a page published to one is published to the other.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: '/', title: 'CiteLadder', kind: 'page', changeFrequency: 'weekly', priority: 1 },
  ...PUBLISHED_PLATFORM.map((item) => ({
    path: item.href,
    title: item.title,
    kind: 'page' as const,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  })),
  { path: '/pricing', title: 'Pricing', kind: 'page', changeFrequency: 'monthly', priority: 0.9 },
  {
    path: '/enterprise',
    title: 'Enterprise',
    kind: 'page',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/solutions',
    title: 'Solutions',
    kind: 'page',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/ai-search-share-of-voice',
    title: 'AI search share of voice',
    kind: 'page',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  { path: '/faq', title: 'FAQ', kind: 'page', changeFrequency: 'monthly', priority: 0.6 },
  {
    path: '/ai-instructions',
    title: 'AI Instructions',
    kind: 'page',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: '/entity-map',
    title: 'Entity Map',
    kind: 'page',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  { path: '/blog', title: 'Blog', kind: 'page', changeFrequency: 'weekly', priority: 0.6 },
  ...RESEARCH_ARTICLES.map(({ frontmatter }) => ({
    path: frontmatter.slug,
    title: frontmatter.title,
    kind: 'page' as const,
    changeFrequency: 'yearly' as const,
    priority: 0.7,
  })),
  ...POSTS.map((post) => ({
    path: `/blog/${post.slug}`,
    title: post.title,
    kind: 'page' as const,
    changeFrequency: 'yearly' as const,
    priority: 0.7,
    lastModified: post.dateModified ?? post.date,
  })),
  {
    path: '/compare',
    title: 'Compare AI visibility tools',
    kind: 'page',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  ...COMPETITORS.map((competitor) => ({
    path: `/compare/${competitor.slug}`,
    title: `CiteLadder vs ${competitor.name}`,
    kind: 'page' as const,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  })),
  { path: '/tools', title: 'Free tools', kind: 'page', changeFrequency: 'monthly', priority: 0.8 },
  ...FREE_TOOLS.map((tool) => ({
    path: `/tools/${tool.slug}`,
    title: tool.title,
    kind: 'page' as const,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  })),
  ...FOOTER_LEGAL_LINKS.map((link) => ({
    path: link.href,
    title: link.label,
    kind: 'policy' as const,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
  })),
];
