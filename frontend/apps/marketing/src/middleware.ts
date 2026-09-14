import { defineMiddleware } from 'astro:middleware';

import { resolveBackendOrigin } from '@/lib/config/backend-origin';

const BACKEND_PATH =
  /^(?:\/api(?:\/|$)|\/mcp(?:\/|$)|\/(?:authorize|token|revoke)(?:$|\/)|\/.well-known\/(?:oauth-authorization-server|oauth-protected-resource\/mcp)$)/;

/** Keep local marketing API calls same-origin without exposing BACKEND_ORIGIN. */
export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  if (!BACKEND_PATH.test(url.pathname)) {
    const response = await next();
    if (!response.headers.has('Cache-Control')) {
      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    return response;
  }

  const backend = resolveBackendOrigin(process.env.BACKEND_ORIGIN);
  const destination = new URL(`${url.pathname}${url.search}`, backend);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  return fetch(destination, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    // Node's Fetch requires this when forwarding a streaming request body.
    // @ts-expect-error Node-specific RequestInit extension.
    duplex: 'half',
  });
});
