import { docsHref } from '@/lib/config/docs';
import { siteOrigin } from '@/lib/seo/site';

/** Where a reader (human or agent) can recover from a missing public page. */
export const NOT_FOUND_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Platform overview', href: '/platform' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Documentation', href: docsHref() },
  { label: 'llms.txt', href: '/llms.txt' },
  { label: 'Sitemap', href: '/sitemap.xml' },
  { label: 'Contact', href: '/contact' },
] as const;

function quality(accept: string, type: string): number | null {
  for (const part of accept.split(',')) {
    const [range = '', ...params] = part.split(';').map((value) => value.trim().toLowerCase());
    if (range !== type) continue;
    const q = params.find((param) => param.startsWith('q='));
    const value = q ? Number(q.slice(2)) : 1;
    return Number.isFinite(value) ? value : 0;
  }
  return null;
}

/** True when the client explicitly asks for Markdown ahead of HTML. */
function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const markdown = quality(accept, 'text/markdown');
  if (!markdown) return false;
  const html = quality(accept, 'text/html');
  return html === null || markdown > html;
}

function notFoundMarkdown(requestUrl: string): string {
  const url = new URL(requestUrl);
  const origin = siteOrigin() ?? url.origin;
  const links = NOT_FOUND_LINKS.map(
    (link) => `- [${link.label}](${new URL(link.href, origin).toString()})`,
  );
  return [
    '# 404: Page not found',
    '',
    `CiteLadder has no public page at \`${url.pathname}\`. It may have moved or never existed.`,
    '',
    '## Where to go next',
    '',
    ...links,
    '',
  ].join('\n');
}

/**
 * A 404 answers `Accept: text/markdown` with a Markdown body for agents and
 * otherwise keeps the HTML page; either way it varies on Accept.
 */
export function negotiateNotFound(request: Request, response: Response): Response {
  if (response.status !== 404) return response;
  const markdown =
    (request.method === 'GET' || request.method === 'HEAD') &&
    prefersMarkdown(request.headers.get('accept'));
  const negotiated = markdown
    ? new Response(request.method === 'HEAD' ? null : notFoundMarkdown(request.url), {
        status: 404,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    : new Response(response.body, response);
  negotiated.headers.append('Vary', 'Accept');
  return negotiated;
}
