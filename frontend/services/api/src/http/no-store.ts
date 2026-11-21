import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../context.ts';
import { isMachinePath } from './origin-token.ts';
import { REVALIDATE_CACHE_CONTROL } from './revalidate.ts';

export function apiNoStore(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    if (!c.req.path.startsWith('/api/') && !isMachinePath(c.req.path)) return;
    const cacheControl = c.res.headers.get('cache-control') ?? '';
    if (cacheControl === REVALIDATE_CACHE_CONTROL && [200, 304].includes(c.res.status)) return;
    c.res.headers.set('cache-control', 'private, no-store, max-age=0');
    c.res.headers.set('pragma', 'no-cache');
    c.res.headers.set('expires', '0');
  };
}
