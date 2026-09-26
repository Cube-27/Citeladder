import { articles } from '../lib/content';
import toolReference from '@/apps/marketing/src/data/mcp-tools.json';

export function GET() {
  return Response.json(
    articles.map(({ title, description, group, href, entry }) => ({
      title,
      description,
      group,
      href,
      body:
        entry.rawContent() + (href === '/mcp/tools/' ? JSON.stringify(toolReference.tools) : ''),
    })),
  );
}
