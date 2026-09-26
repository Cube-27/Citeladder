import { docsHref } from '@/lib/config/docs';
import { articles } from '../lib/content';

export function GET() {
  return new Response(
    `# CiteLadder documentation\n\nProduct guides for measuring search visibility, understanding evidence and improving with the Agent.\n\n${articles.map(({ title, description, href }) => `- [${title}](${docsHref(href)}): ${description}`).join('\n')}\n`,
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  );
}
