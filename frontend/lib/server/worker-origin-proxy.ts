/** Server-only transport shared by the product and marketing Workers. */
export interface WorkerOriginConfig {
  upstream: string;
  publicHost: string;
  originToken: string;
}
type WorkerTransport = (request: Request) => Promise<Response>;

const HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const INTERNAL_HEADERS = new Set([
  'host',
  'forwarded',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'x-citeladder-origin-token',
  'x-citeladder-public-host',
]);

function upstreamOrigin(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Worker upstream must be an HTTPS origin.');
  }
  return url;
}

function originRequest(request: Request, config: WorkerOriginConfig, incoming: URL): Request {
  const upstream = upstreamOrigin(config.upstream);
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (!HOP_HEADERS.has(lower) && !INTERNAL_HEADERS.has(lower)) headers.append(name, value);
  }
  headers.set('X-CiteLadder-Origin-Token', config.originToken);
  headers.set('X-CiteLadder-Public-Host', config.publicHost);
  return new Request(upstream, {
    method: request.method,
    headers,
    body: request.body,
    cache: 'no-store',
    redirect: 'manual',
    signal: request.signal,
  });
}

function originResponse(upstreamResponse: Response): Response {
  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const name of HOP_HEADERS) responseHeaders.delete(name);
  responseHeaders.delete('set-cookie');
  for (const cookie of upstreamResponse.headers.getSetCookie()) {
    responseHeaders.append('Set-Cookie', cookie);
  }
  responseHeaders.set('Cache-Control', 'private, no-store');
  return new Response(
    [204, 205, 304].includes(upstreamResponse.status) ? null : upstreamResponse.body,
    {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    },
  );
}

export async function proxyWorkerRequest(
  request: Request,
  config: WorkerOriginConfig,
  transport: WorkerTransport = fetch,
): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.protocol !== 'https:' || incoming.hostname !== config.publicHost) {
    return new Response('Invalid public host.', { status: 403 });
  }
  if (!config.originToken || config.originToken.length < 32) {
    throw new Error('Worker origin credential is missing.');
  }
  try {
    const upstreamResponse = await transport(originRequest(request, config, incoming));
    return originResponse(upstreamResponse);
  } catch (error) {
    if (request.signal.aborted) throw error;
    return new Response('Origin unavailable.', {
      status: error instanceof DOMException && error.name === 'TimeoutError' ? 504 : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
