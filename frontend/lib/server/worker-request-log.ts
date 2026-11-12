/**
 * The product Workers' request log. Cloudflare's invocation logs record each
 * request's full URL, so an OAuth callback's `code` and `state` (or any
 * emailed token) would sit in the edge logs; those are off in `wrangler.jsonc`
 * and this one line per request records the path without query or fragment,
 * with the ray ID and duration an invocation record carried.
 */
type WorkerFetch<Env> = (request: Request, env: Env) => Promise<Response>;

function requestLine(request: Request, started: number) {
  const url = new URL(request.url);
  return {
    method: request.method,
    host: url.hostname,
    path: url.pathname,
    ray: request.headers.get('cf-ray'),
    duration_ms: Date.now() - started,
  };
}

/** `handler` with one structured log line per request: method, host, path, ray, duration and outcome. */
export function withRequestLog<Env>(handler: WorkerFetch<Env>): WorkerFetch<Env> {
  return async (request, env) => {
    const started = Date.now();
    try {
      const response = await handler(request, env);
      console.log(JSON.stringify({ ...requestLine(request, started), status: response.status }));
      return response;
    } catch (error) {
      console.error(
        JSON.stringify({
          ...requestLine(request, started),
          error: error instanceof Error ? error.name : 'unknown',
        }),
      );
      throw error;
    }
  };
}
