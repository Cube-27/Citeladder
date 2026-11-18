import { docsHref } from '@/lib/config/docs';
import { sitePages } from '../lib/site-pages';

export function GET() {
  const links = sitePages
    .map(({ title, description, href }) => `- [${title}](${docsHref(href)}): ${description}`)
    .join('\n');
  return new Response(
    `# CiteLadder documentation\n\nProduct guides for measuring search visibility, understanding evidence and improving with the Agent, and the REST API reference.\n\n${links}\n`,
    {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    },
  );
}
