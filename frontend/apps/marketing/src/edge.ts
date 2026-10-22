import { routeApexRequest, type ApexEnv } from './apex-route';
import { negotiateNotFound } from './not-found';
import { RESEARCH_REDIRECTS } from './research-articles';
import { withSiteHeaders } from './site-headers';

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
  const destination = RESEARCH_REDIRECTS[url.pathname.replace(/\/$/, '')];
  if (destination && (request.method === 'GET' || request.method === 'HEAD')) {
    url.pathname = destination;
    return withSiteHeaders(request, Response.redirect(url, 301));
  }
  const response = await render(request);
  // Only the site's own HTML page negotiates; JSON and empty 404s keep their bodies.
  const page = response.headers.get('content-type')?.startsWith('text/html') ?? false;
  return page ? negotiateNotFound(request, response) : response;
}
