import { parseFrontmatter } from 'astro/markdown';
import { z } from 'zod';
import { FOUNDER, PRODUCT_HEAD, type PublicPerson } from '@/lib/marketing-content/people';

const researchMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  meta_title: z.string(),
  meta_description: z.string(),
  primary_keyword: z.string(),
  secondary_keywords: z.array(z.string()),
  search_intent: z.string(),
  content_type: z.string(),
  reviewed_at: z.string(),
  published_at: z.string().optional(),
  author: z.string().optional(),
  related_guides: z.array(z.string()).readonly().optional(),
  index_group: z.string().optional(),
  index_meta: z.string().optional(),
  image: z.string().optional(),
  product: z
    .object({ heading: z.string(), href: z.string(), body: z.string() })
    .readonly()
    .optional(),
});

type ResearchMetadata = z.infer<typeof researchMetadataSchema>;

export type ResearchArticle = { frontmatter: ResearchMetadata; markdown: string };

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

function plainText(markdown: string) {
  return linkLabels(markdown.replace(/\[\\\[\d+\\\]\]\(#source-\d+\)/g, ''))
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type ResearchQuestion = { question: string; answer: string };
type ResearchSource = { n: number; markdown: string; href?: string };

export type ResearchParts = {
  body: string;
  faq: { title: string; items: ResearchQuestion[] } | null;
  after: string;
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

export function researchFaqs(markdown: string): { q: string; a: string }[] {
  return (researchParts(markdown).faq?.items ?? [])
    .map((item) => ({ q: plainText(item.question), a: plainText(item.answer) }))
    .filter((item) => item.q && item.a);
}

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

export function researchParent(slug: string) {
  if (slug.startsWith('/compare/')) return { label: 'Compare', href: '/compare' };
  const study = STUDY_PARENTS.find(({ prefix }) => slug.startsWith(prefix));
  return study ? { label: study.label, href: study.href } : { label: 'Blog', href: '/blog' };
}

export function moreGuides(article: ResearchArticle): ResearchArticle[] {
  const slug = article.frontmatter.slug;
  const curated = (article.frontmatter.related_guides ?? [])
    .map((path) => researchArticle(path))
    .filter(
      (guide): guide is ResearchArticle => guide !== undefined && guide.frontmatter.slug !== slug,
    );
  if (curated.length > 0) return curated.slice(0, 2);
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
      return {
        frontmatter: researchMetadataSchema.parse(parsed.frontmatter),
        markdown: parsed.content,
      };
    });

export const RESEARCH_ARTICLES = parseArticles(
  import.meta.glob<string>('../../../lib/marketing-content/blog-posts/research/*.md', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);

export const STUDY_PAGES = parseArticles(
  import.meta.glob<string>('../../../lib/marketing-content/studies/**/*.md', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);

const PEOPLE: readonly PublicPerson[] = [PRODUCT_HEAD, FOUNDER];

export function researchAuthor(article: ResearchArticle): PublicPerson | undefined {
  const name = article.frontmatter.author;
  if (!name) return undefined;
  const person = PEOPLE.find((candidate) => candidate.name === name);
  if (!person) throw new Error(`${article.frontmatter.slug}: unknown author "${name}"`);
  return person;
}

export const studyPagesUnder = (prefix: string) =>
  STUDY_PAGES.filter(({ frontmatter }) => frontmatter.slug.startsWith(prefix));

export function researchArticle(path: string) {
  return [...RESEARCH_ARTICLES, ...STUDY_PAGES].find(
    (article) => article.frontmatter.slug === path,
  );
}

export const RESEARCH_REDIRECTS: Readonly<Record<string, string>> = {
  '/check-ai-visibility': '/blog/verify-improve-ai-search-visibility',
  '/blog/tracking-brand-visibility-ai-search': '/blog/verify-improve-ai-search-visibility',
  '/blog/track-optimize-ai-citations': '/ai-citation-tracking',
};
