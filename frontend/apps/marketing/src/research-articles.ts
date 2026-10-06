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
};

export type ResearchArticle = { frontmatter: ResearchMetadata; markdown: string };

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
