import { parseFrontmatter } from 'astro/markdown';

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
  /** Curated "More guides" slugs; guides without them fall back to publication order. */
  related_guides?: readonly string[];
  /** Social card image; guides without one use the site image. */
  image?: string;
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

/** The breadcrumb parent: comparison guides sit under Compare, every other guide under Guides. */
export function researchParent(slug: string) {
  return slug.startsWith('/compare/')
    ? { label: 'Compare', href: '/compare' }
    : { label: 'Guides', href: '/blog' };
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
  const position = RESEARCH_ARTICLES.indexOf(article);
  return [1, 2]
    .map((step) => RESEARCH_ARTICLES[(position + step) % RESEARCH_ARTICLES.length]!)
    .filter((guide) => guide.frontmatter.slug !== slug);
}

// The existing Markdown renderer serves crawlable HTML. Frontmatter is the
// single metadata owner for routes, the resource listing and the sitemap.
const modules = import.meta.glob<string>(
  '../../../lib/marketing-content/blog-posts/research/*.md',
  { eager: true, query: '?raw', import: 'default' },
);

export const RESEARCH_ARTICLES: readonly ResearchArticle[] = Object.entries(modules)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([, markdown]) => {
    const parsed = parseFrontmatter(markdown);
    return { frontmatter: parsed.frontmatter as ResearchMetadata, markdown: parsed.content };
  });

export function researchArticle(path: string) {
  return RESEARCH_ARTICLES.find((article) => article.frontmatter.slug === path);
}

// Keep established inbound URLs while consolidating the same reader intent.
export const RESEARCH_REDIRECTS: Readonly<Record<string, string>> = {
  '/check-ai-visibility': '/blog/verify-improve-ai-search-visibility',
  '/blog/tracking-brand-visibility-ai-search': '/blog/verify-improve-ai-search-visibility',
  '/blog/track-optimize-ai-citations': '/ai-citation-tracking',
};
