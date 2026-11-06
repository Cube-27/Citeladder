import { POSTS } from '@/lib/marketing-content/blog';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import { AI_POLICY, COOKIE_POLICY, FOOTER_LEGAL_LINKS } from '@/lib/marketing-content/legal';
import {
  CANCELLATION_POLICY,
  CONTACT_PAGE,
  REFUND_POLICY,
} from '@/lib/marketing-content/legal-billing';
import { DATA_PROCESSING_AGREEMENT, SUBPROCESSORS } from '@/lib/marketing-content/legal-dpa';
import { PRIVACY_POLICY } from '@/lib/marketing-content/legal-privacy';
import { TERMS_OF_SERVICE } from '@/lib/marketing-content/legal-terms';
import { PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';
import { PAGES, type PageRecord } from '@/lib/marketing-content/pages';
import { PLATFORM_PAGES } from '@/lib/marketing-content/platform-pages';
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
  /** The sitemap <lastmod>, from the page's record. */
  updated?: string;
};

const page = (
  path: string,
  title: string,
  changeFrequency: ChangeFrequency,
  priority: number,
  updated?: string,
): PublicRoute => ({ path, title, kind: 'page', changeFrequency, priority, updated });

const fromRecord = (record: PageRecord, changeFrequency: ChangeFrequency, priority: number) =>
  page(record.path, record.title, changeFrequency, priority, record.updated);

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
  ].map((document) => [document.path, document.updated]),
);

/** An index page changes whenever a page it lists does. */
const latest = (dates: readonly (string | undefined)[]) =>
  dates
    .filter((date): date is string => date !== undefined)
    .sort((left, right) => left.localeCompare(right))
    .at(-1);

const researchUnder = (prefix: string) =>
  RESEARCH_ARTICLES.filter(({ frontmatter }) => frontmatter.slug.startsWith(prefix)).map(
    ({ frontmatter }) => frontmatter.reviewed_at,
  );
const postUpdated = (post: (typeof POSTS)[number]) => post.dateModified ?? post.date;
const platformUpdated = (path: string) =>
  PLATFORM_PAGES.find((candidate) => candidate.path === path)?.updated;

/**
 * Every indexable marketing page, once. The sitemap and llms.txt both read this
 * list, so a page published to one is published to the other.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  fromRecord(PAGES.home, 'weekly', 1),
  ...PUBLISHED_PLATFORM.map((item) =>
    page(item.href, item.title, 'monthly', 0.8, platformUpdated(item.href)),
  ),
  fromRecord(PAGES.pricing, 'monthly', 0.9),
  fromRecord(PAGES.enterprise, 'monthly', 0.8),
  fromRecord(PAGES.solutions, 'monthly', 0.8),
  fromRecord(PAGES.shareOfVoice, 'monthly', 0.8),
  fromRecord(PAGES.faq, 'monthly', 0.6),
  fromRecord(PAGES.aiInstructions, 'monthly', 0.5),
  fromRecord(PAGES.entityMap, 'monthly', 0.5),
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
    PAGES.compare.path,
    PAGES.compare.title,
    'monthly',
    0.6,
    latest([
      PAGES.compare.updated,
      ...COMPETITORS.map((competitor) => competitor.updated),
      ...researchUnder('/compare/'),
    ]),
  ),
  ...COMPETITORS.map((competitor) =>
    page(
      `/compare/${competitor.slug}`,
      `CiteLadder vs ${competitor.name}`,
      'monthly',
      0.5,
      competitor.updated,
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
