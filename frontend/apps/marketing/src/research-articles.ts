import { parseFrontmatter } from 'astro/markdown';
import { FOUNDER, PRODUCT_HEAD, type PublicPerson } from '@/lib/marketing-content/people';

type ResearchMetadata = {
  title: string;
  slug: string;
  meta_title: string;
  meta_description: string;
  primary_keyword: string;
  secondary_keywords: string[];
  search_intent: string;
  content_type: string;
  reviewed_at: string;
  /** First publication date, when the page states one. */
  published_at?: string;
  /** The person credited as author, by name; must be one of the public people in people.ts. */
  author?: string;
  /** Curated "More guides" slugs; guides without them fall back to publication order. */
  related_guides?: readonly string[];
  /** Study pages: the group their section index lists them under, and that row's meta line. */
  index_group?: string;
  index_meta?: string;
  /** Social card image; guides without one use the site image. */
  image?: string;
  /** The guide's product section: a heading, the guide's own copy and the module it leads to. */
  product?: Readonly<{
    heading: string;
    /** A /platform page with its own screen. */
    href: string;
    body: string;
  }>;
};

export type ResearchArticle = { frontmatter: ResearchMetadata; markdown: string };

/**
 * Each `[label](target)` link reduced to its label, in one forward pass. A
 * match starts at the leftmost `[` whose first following `]` closes a
 * non-empty label and is followed by `(`, a non-empty target and `)`. Every
 * `[` before the same `]` shares that verdict, so a failed candidate resumes
 * at the `]` instead of rescanning the label from each bracket.
 */
function linkLabels(markdown: string) {
  let out = '';
  let copied = 0;
  let from = 0;
  for (;;) {
    const open = markdown.indexOf('[', from);
    if (open === -1) break;
    const close = markdown.indexOf(']', open + 1);
    if (close === -1) break;
    if (close > open + 1 && markdown.charAt(close + 1) === '(') {
      const end = markdown.indexOf(')', close + 2);
      // No `)` after this point means no later link can close either.
      if (end === -1) break;
      if (end > close + 2) {
        out += markdown.slice(copied, open) + markdown.slice(open + 1, close);
        copied = end + 1;
        from = end + 1;
        continue;
      }
    }
    from = close + 1;
  }
  return out + markdown.slice(copied);
}

/** Inline Markdown reduced to the plain text a search engine reads as an answer. */
function plainText(markdown: string) {
  return linkLabels(markdown.replace(/\[\\\[\d+\\\]\]\(#source-\d+\)/g, ''))
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type ResearchQuestion = { question: string; answer: string };
type ResearchSource = { n: number; markdown: string; href?: string };

/** A guide's Markdown, split into the parts its page lays out separately. */
export type ResearchParts = {
  /** Everything before the FAQ (or before the sources, without one). */
  body: string;
  /** The "Frequently asked questions" section: each `### ` heading and the Markdown under it. */
  faq: { title: string; items: ResearchQuestion[] } | null;
  /** Sections between the FAQ and the sources. */
  after: string;
  /** The `## Sources…` section: any lead-in lines, then the numbered list. */
  sources: { title: string; notes: string[]; items: ResearchSource[] } | null;
};

const FAQ_HEADING = /^## (Frequently asked questions)[^\S\n]*$/m;
const SOURCES_HEADING = /^## (Sources\b.*)$/m;
const SOURCE_LINE = /^(\d+)\. (?:<span id="source-\d+"><\/span> )?(.+)$/;
const FIRST_LINK = /\]\(([^)\s]+)\)/;

function faqItems(section: string): ResearchQuestion[] {
  return section
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [question = '', ...answer] = block.split('\n');
      return { question: question.trim(), answer: answer.join('\n').trim() };
    })
    .filter((item) => item.question && item.answer);
}

function sourceParts(title: string, section: string): NonNullable<ResearchParts['sources']> {
  const notes: string[] = [];
  const items: ResearchSource[] = [];
  for (const line of section.split('\n').map((value) => value.trim())) {
    if (!line) continue;
    const source = SOURCE_LINE.exec(line);
    if (!source) {
      notes.push(line);
      continue;
    }
    // Both groups take part in every match.
    const [, n = '', text = ''] = source;
    items.push({ n: Number(n), markdown: text, href: FIRST_LINK.exec(text)?.[1] });
  }
  return { title, notes, items };
}

export function researchParts(markdown: string): ResearchParts {
  const sourcesAt = SOURCES_HEADING.exec(markdown);
  const content = sourcesAt ? markdown.slice(0, sourcesAt.index) : markdown;
  const sources = sourcesAt
    ? sourceParts(sourcesAt[1] ?? 'Sources', markdown.slice(sourcesAt.index + sourcesAt[0].length))
    : null;
  const faqAt = FAQ_HEADING.exec(content);
  if (!faqAt) return { body: content, faq: null, after: '', sources };
  const rest = content.slice(faqAt.index + faqAt[0].length);
  const end = /^## /m.exec(rest)?.index ?? rest.length;
  return {
    body: content.slice(0, faqAt.index),
    faq: { title: faqAt[1] ?? 'Frequently asked questions', items: faqItems(rest.slice(0, end)) },
    after: rest.slice(end),
    sources,
  };
}

/**
 * The guide's "Frequently asked questions" section as plain-text
 * question/answer pairs, for FAQPage data. Guides without the section have none.
 */
export function researchFaqs(markdown: string): { q: string; a: string }[] {
  return (researchParts(markdown).faq?.items ?? [])
    .map((item) => ({ q: plainText(item.question), a: plainText(item.answer) }))
    .filter((item) => item.q && item.a);
}

/** Study pages sit under their section's index; the first matching prefix wins. */
const STUDY_PARENTS = [
  { prefix: '/ai-crawlers/', label: 'AI crawlers', href: '/ai-crawlers' },
  { prefix: '/buyer-prompts/', label: 'Buyer prompts', href: '/buyer-prompts' },
  {
    prefix: '/claude-recommendations/',
    label: 'Claude recommendations',
    href: '/claude-recommendations',
  },
  { prefix: '/research/', label: 'Research', href: '/research' },
] as const;

/**
 * The breadcrumb parent: comparison guides sit under Compare, study pages
 * under their section, every other guide under the Blog, named as the nav
 * and URL name it.
 */
export function researchParent(slug: string) {
  if (slug.startsWith('/compare/')) return { label: 'Compare', href: '/compare' };
  const study = STUDY_PARENTS.find(({ prefix }) => slug.startsWith(prefix));
  return study ? { label: study.label, href: study.href } : { label: 'Blog', href: '/blog' };
}

/** The two guides shown under "More guides": curated when set, else the next two published. */
export function moreGuides(article: ResearchArticle): ResearchArticle[] {
  const slug = article.frontmatter.slug;
  const curated = (article.frontmatter.related_guides ?? [])
    .map((path) => researchArticle(path))
    .filter(
      (guide): guide is ResearchArticle => guide !== undefined && guide.frontmatter.slug !== slug,
    );
  if (curated.length > 0) return curated.slice(0, 2);
  // The fallback stays in the article's own collection: guides lead to guides, study pages to study pages.
  const collection = STUDY_PAGES.includes(article) ? STUDY_PAGES : RESEARCH_ARTICLES;
  const position = collection.indexOf(article);
  return [1, 2]
    .map((step) => collection[(position + step) % collection.length])
    .filter(
      (guide): guide is ResearchArticle => guide !== undefined && guide.frontmatter.slug !== slug,
    );
}

const parseArticles = (modules: Record<string, string>): readonly ResearchArticle[] =>
  Object.entries(modules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, markdown]) => {
      const parsed = parseFrontmatter(markdown);
      return { frontmatter: parsed.frontmatter as ResearchMetadata, markdown: parsed.content };
    });

// The existing Markdown renderer serves crawlable HTML. Frontmatter is the
// single metadata owner for routes, the resource listing and the sitemap.
export const RESEARCH_ARTICLES = parseArticles(
  import.meta.glob<string>('../../../lib/marketing-content/blog-posts/research/*.md', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);

/**
 * Pages of CiteLadder's own studies (the AI crawler directory, study reports),
 * written from each study's measured data. Same template as the guides, but
 * listed in their own sections rather than the blog.
 */
export const STUDY_PAGES = parseArticles(
  import.meta.glob<string>('../../../lib/marketing-content/studies/**/*.md', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);

const PEOPLE: readonly PublicPerson[] = [PRODUCT_HEAD, FOUNDER];

/** The page's credited author, or none; an author name outside people.ts is a content error. */
export function researchAuthor(article: ResearchArticle): PublicPerson | undefined {
  const name = article.frontmatter.author;
  if (!name) return undefined;
  const person = PEOPLE.find((candidate) => candidate.name === name);
  if (!person) throw new Error(`${article.frontmatter.slug}: unknown author "${name}"`);
  return person;
}

/** Study pages under a section prefix, such as `/ai-crawlers/`. */
export const studyPagesUnder = (prefix: string) =>
  STUDY_PAGES.filter(({ frontmatter }) => frontmatter.slug.startsWith(prefix));

export function researchArticle(path: string) {
  return [...RESEARCH_ARTICLES, ...STUDY_PAGES].find(
    (article) => article.frontmatter.slug === path,
  );
}

// Keep established inbound URLs while consolidating the same reader intent.
export const RESEARCH_REDIRECTS: Readonly<Record<string, string>> = {
  '/check-ai-visibility': '/blog/verify-improve-ai-search-visibility',
  '/blog/tracking-brand-visibility-ai-search': '/blog/verify-improve-ai-search-visibility',
  '/blog/track-optimize-ai-citations': '/ai-citation-tracking',
};
