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
