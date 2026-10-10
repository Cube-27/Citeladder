import type { MarkdownInstance } from 'astro';
import { z } from 'zod';
import toolCatalog from '../data/mcp-tools.json';
import { API_OPERATIONS, API_SCHEMAS } from './api-reference';

const metadata = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  group: z.enum([
    'Start here',
    'Measure and understand',
    'Improve with Agent',
    'Connect with MCP',
    'Use the REST API',
    'Updates',
  ]),
  order: z.number(),
});

type Metadata = z.infer<typeof metadata>;
export type Group = Metadata['group'];
const modules = import.meta.glob<MarkdownInstance<Metadata>>('../content/**/*.md', { eager: true });

/** The article that renders the generated MCP tool catalogue after its body. */
const TOOL_REFERENCE_SLUG = 'mcp/tools';
export const TOOL_REFERENCE_HEADING = {
  depth: 2,
  slug: 'registered-tools',
  text: 'Registered tools',
} as const;
/** The article that renders the generated public API operations after its body. */
const API_REFERENCE_SLUG = 'api/reference';
export const API_REFERENCE_HEADING = {
  depth: 2,
  slug: 'operations',
  text: 'Operations',
} as const;
export const API_SCHEMAS_HEADING = { depth: 2, slug: 'schemas', text: 'Schemas' } as const;

export const articles = Object.entries(modules)
  .map(([file, entry]) => {
    const slug = file.replace('../content/', '').replace(/\.md$/, '');
    return {
      ...metadata.parse(entry.frontmatter),
      slug,
      href: slug === 'index' ? '/' : `/${slug}/`,
      toolReference: slug === TOOL_REFERENCE_SLUG,
      apiReference: slug === API_REFERENCE_SLUG,
      entry,
    };
  })
  .sort((a, b) => a.order - b.order);

type Article = (typeof articles)[number];

export const groups = [...new Set(articles.map((article) => article.group))];

/** The article's table of contents, including the appended tool catalogue. */
export async function articleHeadings(article: Article) {
  const headings = (await article.entry.getHeadings()).filter(
    ({ depth }) => depth === 2 || depth === 3,
  );
  if (article.toolReference) return [...headings, TOOL_REFERENCE_HEADING];
  if (article.apiReference) return [...headings, API_REFERENCE_HEADING, API_SCHEMAS_HEADING];
  return headings;
}

/** The text search matches for an article, including an appended generated reference. */
export function articleSearchBody(article: Article): string {
  const body = article.entry.rawContent();
  if (article.toolReference) return body + JSON.stringify(toolCatalog.tools);
  if (article.apiReference)
    return (
      body +
      [
        ...API_OPERATIONS.map((operation) => `${operation.method} ${operation.path}`),
        ...API_SCHEMAS.map((schema) => schema.name),
      ].join('\n')
    );
  return body;
}
