import { docsHref } from '@/lib/config/docs';
import { MCP_SERVER_URL } from '@/lib/config/mcp-clients';
import { routeApexRequest, type ApexEnv } from './apex-route';
import { negotiateNotFound } from './not-found';
import { RESEARCH_REDIRECTS } from './research-articles';
import { withSiteHeaders } from './site-headers';

function movedOffSite(path: string): string | undefined {
  if (path === '/mcp') return MCP_SERVER_URL;
  if (path === '/docs/mcp' || path.startsWith('/docs/mcp/')) return docsHref('/mcp/');
  return undefined;
}

const RENAMED_PLATFORM_PAGES: Readonly<Record<string, string>> = {
  '/platform/citation-intelligence': '/platform/cited-sources',
  '/platform/commerce-intelligence': '/platform/product-visibility',
  '/platform/demand-intelligence': '/platform/search-demand',
  '/platform/search-intelligence': '/platform/keyword-research',
  '/platform/content-intelligence': '/platform/content-optimization',
  '/platform/content-briefs': '/platform/content-optimization',
};

/**
 * Everything the marketing Worker decides before Astro renders. The 404 page
 * is prerendered (so scanner traffic stays inside the free 10 ms CPU limit),
 * and Astro serves it without running middleware, so apex routing, redirects
 * and Markdown 404s live here instead.
 */
export async function serveMarketingRequest(
  request: Request,
  env: ApexEnv,
  render: (request: Request) => Promise<Response>,
): Promise<Response> {
  const routed = await routeApexRequest(request, env);
  if (routed) return withSiteHeaders(request, routed);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const read = request.method === 'GET' || request.method === 'HEAD';
  const destination = RESEARCH_REDIRECTS[path] ?? RENAMED_PLATFORM_PAGES[path];
  if (destination && read) {
    url.pathname = destination;
    return withSiteHeaders(request, Response.redirect(url, 301));
  }
  const moved = read ? movedOffSite(path) : undefined;
  if (moved) return withSiteHeaders(request, Response.redirect(moved, 301));
  if (path.startsWith('/_next/')) {
    return withSiteHeaders(request, new Response(null, { status: 410 }));
  }
  const response = await render(request);
  const page = response.headers.get('content-type')?.startsWith('text/html') ?? false;
  return page ? negotiateNotFound(request, response) : response;
}
