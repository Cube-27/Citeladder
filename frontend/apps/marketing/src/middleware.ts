import type { MiddlewareHandler } from 'astro';
import { routeApexRequest } from './apex-route';
import { workerApexEnv } from './worker-env';
import { FALLBACK_CONTENT_SECURITY_POLICY } from '@/lib/config/content-security-policy';
import { researchArticle, RESEARCH_REDIRECTS } from './research-articles';

export const onRequest: MiddlewareHandler = async ({ request }, next) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const destination =
    RESEARCH_REDIRECTS[path] ?? (path !== url.pathname && researchArticle(path) ? path : undefined);
  const routed = await routeApexRequest(request, workerApexEnv());
  let redirect: Response | undefined;
  if (!routed && destination && (request.method === 'GET' || request.method === 'HEAD')) {
    url.pathname = destination;
    redirect = Response.redirect(url, 301);
  }
  const response = routed ?? redirect ?? (await next());
  const headers = new Headers(response.headers);
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', FALLBACK_CONTENT_SECURITY_POLICY);
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  if (new URL(request.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
  return new Response(response.body, { status: response.status, headers });
};
