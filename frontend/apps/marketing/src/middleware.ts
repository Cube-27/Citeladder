import type { MiddlewareHandler } from 'astro';
import { routeApexRequest } from './apex-route';
import { workerApexEnv } from './worker-env';

export const onRequest: MiddlewareHandler = async ({ request }, next) => {
  const routed = await routeApexRequest(request, workerApexEnv());
  const response = routed ?? (await next());
  const headers = new Headers(response.headers);
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
