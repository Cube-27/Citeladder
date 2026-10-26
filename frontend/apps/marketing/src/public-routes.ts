import { POSTS } from '@/lib/marketing-content/blog';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import {
  AI_POLICY,
  COOKIE_POLICY,
  FOOTER_LEGAL_LINKS,
  LEGAL_ENTITY,
} from '@/lib/marketing-content/legal';
import {
  CANCELLATION_POLICY,
  CONTACT_PAGE,
  REFUND_POLICY,
} from '@/lib/marketing-content/legal-billing';
import { DATA_PROCESSING_AGREEMENT, SUBPROCESSORS } from '@/lib/marketing-content/legal-dpa';
import { PRIVACY_POLICY } from '@/lib/marketing-content/legal-privacy';
import { TERMS_OF_SERVICE } from '@/lib/marketing-content/legal-terms';
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
 * When each page whose content carries no date of its own last changed in
 * substance (copy, data or layout; not the shared header and footer). Revise
 * the entry with the page: it is the sitemap <lastmod>, and a new value makes
 * the post-deploy IndexNow ping resubmit the URL.
 */
const PAGE_UPDATED = {
  home: '2026-10-16',
  platform: '2026-10-20',
  pricing: '2026-10-20',
  enterprise: '2026-10-21',
  solutions: '2026-10-16',
  shareOfVoice: '2026-10-20',
  faq: '2026-10-20',
  aiReference: '2026-10-16',
  competitors: '2026-10-20',
} as const;

const LEGAL_UPDATED = new Map(
  [
    TERMS_OF_SERVICE,
    PRIVACY_POLICY,
    REFUND_POLICY,
    CANCELLATION_POLICY,
    COOKIE_POLICY,
    AI_POLICY,
    DATA_PROCESSING_AGREEMENT,
    SUBPROCESSORS,
    CONTACT_PAGE,
  ].map((document) => [`/${document.slug}`, document.lastUpdated ?? LEGAL_ENTITY.lastUpdated]),
);

/** An index page changes whenever a page it lists does. */
const latest = (dates: readonly (string | undefined)[]) =>
  dates
    .filter((date): date is string => date !== undefined)
    .sort()
    .at(-1);

const researchUnder = (prefix: string) =>
  RESEARCH_ARTICLES.filter(({ frontmatter }) => frontmatter.slug.startsWith(prefix)).map(
    ({ frontmatter }) => frontmatter.reviewed_at,
  );
const postUpdated = (post: (typeof POSTS)[number]) => post.dateModified ?? post.date;

/**
 * Every indexable marketing page, once. The sitemap and llms.txt both read this
 * list, so a page published to one is published to the other.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  page('/', 'CiteLadder', 'weekly', 1, PAGE_UPDATED.home),
  ...PUBLISHED_PLATFORM.map((item) =>
    page(item.href, item.title, 'monthly', 0.8, PAGE_UPDATED.platform),
  ),
  page('/pricing', 'Pricing', 'monthly', 0.9, PAGE_UPDATED.pricing),
  page('/enterprise', 'Enterprise', 'monthly', 0.8, PAGE_UPDATED.enterprise),
  page('/solutions', 'Solutions', 'monthly', 0.8, PAGE_UPDATED.solutions),
  page(
    '/ai-search-share-of-voice',
    'AI search share of voice',
    'monthly',
    0.8,
    PAGE_UPDATED.shareOfVoice,
  ),
  page('/faq', 'FAQ', 'monthly', 0.6, PAGE_UPDATED.faq),
  page('/ai-instructions', 'AI Instructions', 'monthly', 0.5, PAGE_UPDATED.aiReference),
  page('/entity-map', 'Entity Map', 'monthly', 0.5, PAGE_UPDATED.aiReference),
  page(
    '/blog',
    'Blog',
    'weekly',
    0.6,
    latest([...researchUnder('/blog/'), ...POSTS.map(postUpdated)]),
  ),
  ...RESEARCH_ARTICLES.map(({ frontmatter }) =>
    page(frontmatter.slug, frontmatter.title, 'yearly', 0.7, frontmatter.reviewed_at),
  ),
  ...POSTS.map((post) => page(`/blog/${post.slug}`, post.title, 'yearly', 0.7, postUpdated(post))),
  page(
    '/compare',
    'Compare AI visibility tools',
    'monthly',
    0.6,
    latest([PAGE_UPDATED.competitors, ...researchUnder('/compare/')]),
  ),
  ...COMPETITORS.map((competitor) =>
    page(
      `/compare/${competitor.slug}`,
      `CiteLadder vs ${competitor.name}`,
      'monthly',
      0.5,
      PAGE_UPDATED.competitors,
    ),
  ),
  page('/tools', 'Free tools', 'monthly', 0.8, latest(FREE_TOOLS.map((tool) => tool.updated))),
  ...FREE_TOOLS.map((tool) =>
    page(`/tools/${tool.slug}`, tool.title, 'monthly', 0.7, tool.updated),
  ),
  // Contact shares the legal footer row but is a page, not a policy.
  ...FOOTER_LEGAL_LINKS.map((link) => {
    const route = page(link.href, link.label, 'yearly', 0.3, LEGAL_UPDATED.get(link.href));
    return link.href === '/contact' ? route : { ...route, kind: 'policy' as const };
  }),
];
