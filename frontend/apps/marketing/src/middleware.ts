import type { MiddlewareHandler } from 'astro';
import { withSiteHeaders } from './site-headers';

// Apex routing, redirects and 404 negotiation run in worker.ts before Astro;
// this only adds headers to the pages Astro renders on demand.
export const onRequest: MiddlewareHandler = async ({ request, isPrerendered }, next) => {
  if (isPrerendered) return next();
  return withSiteHeaders(request, await next());
};
