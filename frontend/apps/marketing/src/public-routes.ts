import { POSTS } from '@/lib/marketing-content/blog';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import { CONTACT_PAGE } from '@/lib/marketing-content/legal-billing';
import { LEGAL_DOCUMENTS } from '@/lib/marketing-content/legal-documents';
import { PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';
import { PAGES, type PageRecord } from '@/lib/marketing-content/pages';
import { PLATFORM_PAGES } from '@/lib/marketing-content/platform-pages';
import { FREE_TOOLS } from '@/lib/marketing-content/tools';
import { STUDY_INDEXES } from '@/lib/marketing-content/studies/indexes';
import { RESEARCH_ARTICLES, STUDY_PAGES, studyPagesUnder } from './research-articles';

type ChangeFrequency = 'monthly' | 'weekly' | 'yearly';

export type PublicRoute = {
  path: string;
  title: string;
  kind: 'page' | 'policy';
  changeFrequency: ChangeFrequency;
  priority: number;
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
  ...Object.values(STUDY_INDEXES).map((index) =>
    page(
      index.path,
      index.title,
      'monthly',
      0.7,
      latest([
        index.updated,
        ...studyPagesUnder(`${index.path}/`).map(({ frontmatter }) => frontmatter.reviewed_at),
      ]),
    ),
  ),
  ...STUDY_PAGES.map(({ frontmatter }) =>
    page(frontmatter.slug, frontmatter.title, 'monthly', 0.6, frontmatter.reviewed_at),
  ),
  page('/tools', 'Free tools', 'monthly', 0.8, latest(FREE_TOOLS.map((tool) => tool.updated))),
  ...FREE_TOOLS.map((tool) =>
    page(`/tools/${tool.slug}`, tool.title, 'monthly', 0.7, tool.updated),
  ),
  ...LEGAL_DOCUMENTS.map((document) => {
    const route = page(
      document.path,
      document.navLabel ?? document.title,
      'yearly',
      0.3,
      document.updated,
    );
    return document === CONTACT_PAGE ? route : { ...route, kind: 'policy' as const };
  }),
];
