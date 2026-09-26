import type { MarkdownInstance } from 'astro';
import { z } from 'zod';

const metadata = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  group: z.enum([
    'Start here',
    'Measure and understand',
    'Improve with Agent',
    'Connect with MCP',
    'Updates',
  ]),
  order: z.number(),
});

type Metadata = z.infer<typeof metadata>;
const modules = import.meta.glob<MarkdownInstance<Metadata>>('../content/**/*.md', { eager: true });

export const articles = Object.entries(modules)
  .map(([file, entry]) => {
    const slug = file.replace('../content/', '').replace(/\.md$/, '');
    return {
      ...metadata.parse(entry.frontmatter),
      slug,
      href: slug === 'index' ? '/' : `/${slug}/`,
      entry,
    };
  })
  .sort((a, b) => a.order - b.order);

export const groups = [...new Set(articles.map((article) => article.group))];
