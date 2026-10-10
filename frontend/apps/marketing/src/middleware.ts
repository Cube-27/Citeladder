import type { MiddlewareHandler } from 'astro';
import { routeApexRequest } from './apex-route';
import { workerApexEnv } from './worker-env';
import { FALLBACK_CONTENT_SECURITY_POLICY } from '@/lib/config/content-security-policy';
import { SECURITY_HEADERS } from '@/lib/config/security-headers';
import { negotiateNotFound } from './not-found';
import { RESEARCH_REDIRECTS } from './research-articles';

// Prerendered pages are static assets: their headers come from the generated
// `_headers` file (scripts/check-marketing-worker-output.mjs), so this only
// shapes responses the Worker renders on demand.
export const onRequest: MiddlewareHandler = async ({ request, isPrerendered }, next) => {
  if (isPrerendered) return next();
  const url = new URL(request.url);
  const destination = RESEARCH_REDIRECTS[url.pathname.replace(/\/$/, '')];
  const routed = await routeApexRequest(request, workerApexEnv());
  let redirect: Response | undefined;
  if (!routed && destination && (request.method === 'GET' || request.method === 'HEAD')) {
    url.pathname = destination;
    redirect = Response.redirect(url, 301);
  }
  // Only Astro-rendered 404s negotiate; proxied backend and apex 404s keep their bodies.
  const response = routed ?? redirect ?? negotiateNotFound(request, await next());
  const headers = new Headers(response.headers);
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', FALLBACK_CONTENT_SECURITY_POLICY);
  }
  const https = url.protocol === 'https:';
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // Local Wrangler serves plain HTTP, where HSTS would be meaningless.
    if (https || name !== 'Strict-Transport-Security') headers.set(name, value);
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  return new Response(response.body, { status: response.status, headers });
};
