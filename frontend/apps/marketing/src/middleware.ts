import type { MiddlewareHandler } from 'astro';
import { withSiteHeaders } from './site-headers';

export const onRequest: MiddlewareHandler = async ({ request, isPrerendered }, next) => {
  if (isPrerendered) return next();
  return withSiteHeaders(request, await next());
};
