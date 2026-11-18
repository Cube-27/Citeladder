import type { MarkdownInstance } from 'astro';
import { z } from 'zod';
import toolCatalog from '../data/mcp-tools.json';

const metadata = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  group: z.enum([
    'Start here',
    'Measure and understand',
    'Improve with Agent',
    'Connect with MCP',
    'API',
    'Updates',
  ]),
  order: z.number(),
  /** The date the article's content last changed, shown and declared as its modified date. */
  updated: z.iso.date(),
});

type Metadata = z.infer<typeof metadata>;
const modules = import.meta.glob<MarkdownInstance<Metadata>>('../content/**/*.md', { eager: true });

/** The article that renders the generated MCP tool catalogue after its body. */
const TOOL_REFERENCE_SLUG = 'mcp/tools';
export const TOOL_REFERENCE_HEADING = {
  depth: 2,
  slug: 'registered-tools',
  text: 'Registered tools',
} as const;

/** The API section's own group, which has its own sidebar. */
export const API_GROUP = 'API';

/** `api/index` is the section's front door, `/api/`; `index` is the site's. */
const routeOf = (slug: string) => slug.replace(/(^|\/)index$/, '');

export const articles = Object.entries(modules)
  .map(([file, entry]) => {
    const slug = file.replace('../content/', '').replace(/\.md$/, '');
    const route = routeOf(slug);
    return {
      ...metadata.parse(entry.frontmatter),
      slug,
      route,
      href: route === '' ? '/' : `/${route}/`,
      toolReference: slug === TOOL_REFERENCE_SLUG,
      entry,
    };
  })
  .sort((a, b) => a.order - b.order);

type Article = (typeof articles)[number];

/** The guide groups; the API section's pages are listed by its own sidebar. */
export const groups = [
  ...new Set(articles.map((article) => article.group).filter((group) => group !== API_GROUP)),
];

/** The article's table of contents, including the appended tool catalogue. */
export async function articleHeadings(article: Article) {
  const headings = (await article.entry.getHeadings()).filter(
    ({ depth }) => depth === 2 || depth === 3,
  );
  return article.toolReference ? [...headings, TOOL_REFERENCE_HEADING] : headings;
}

/** The text search matches for an article, including an appended generated reference. */
export function articleSearchBody(article: Article): string {
  const body = article.entry.rawContent();
  return article.toolReference ? body + JSON.stringify(toolCatalog.tools) : body;
}
