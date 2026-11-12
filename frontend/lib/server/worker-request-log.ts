/**
 * The product Workers' request log. Cloudflare's invocation logs record each
 * request's full URL, so an OAuth callback's `code` and `state` (or any
 * emailed token) would sit in the edge logs; those are off in `wrangler.jsonc`
 * and this one line per request records the path without query or fragment.
 */
type WorkerFetch<Env> = (request: Request, env: Env) => Promise<Response>;

function requestLine(request: Request) {
  const url = new URL(request.url);
  return { method: request.method, host: url.hostname, path: url.pathname };
}

/** `handler` with one structured log line per request: method, host, path and outcome. */
export function withRequestLog<Env>(handler: WorkerFetch<Env>): WorkerFetch<Env> {
  return async (request, env) => {
    try {
      const response = await handler(request, env);
      console.log(JSON.stringify({ ...requestLine(request), status: response.status }));
      return response;
    } catch (error) {
      console.error(
        JSON.stringify({
          ...requestLine(request),
          error: error instanceof Error ? error.name : 'unknown',
        }),
      );
      throw error;
    }
  };
}
