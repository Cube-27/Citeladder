import {
  ORIGIN_CLIENT_IP_HEADER,
  ORIGIN_PUBLIC_HOST_HEADER,
  ORIGIN_SIGNATURE_HEADER,
  ORIGIN_TIMESTAMP_HEADER,
  signOriginRequest,
} from '@citeladder/contracts/origin-signature';

/** Server-only transport shared by the product and marketing Workers. */
export interface WorkerOriginConfig {
  upstream: string;
  publicHost: string;
  originToken: string;
  allowDevelopmentHttp?: boolean;
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
  'x-citeladder-origin-timestamp',
  'x-citeladder-origin-signature',
  'x-citeladder-public-host',
  'x-citeladder-client-ip',
]);

function upstreamOrigin(value: string, allowDevelopmentHttp = false): URL {
  const url = new URL(value);
  const localComposeUpstream =
    allowDevelopmentHttp &&
    url.protocol === 'http:' &&
    url.hostname === 'api-service' &&
    url.port === '8100';
  if (
    (url.protocol !== 'https:' && !localComposeUpstream) ||
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

async function originRequest(
  request: Request,
  config: WorkerOriginConfig,
  incoming: URL,
): Promise<Request> {
  const upstream = upstreamOrigin(config.upstream, config.allowDevelopmentHttp);
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (!HOP_HEADERS.has(lower) && !INTERNAL_HEADERS.has(lower)) headers.append(name, value);
  }
  // Cloudflare sets CF-Connecting-IP on every Worker request; the API trusts it
  // only inside a valid signature, so per-visitor rate limits survive.
  const clientIp = request.headers.get('cf-connecting-ip') ?? '';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signOriginRequest(config.originToken, {
    timestamp,
    method: request.method,
    publicHost: config.publicHost,
    target: `${upstream.pathname}${upstream.search}`,
    clientIp,
  });
  headers.set(ORIGIN_TIMESTAMP_HEADER, String(timestamp));
  headers.set(ORIGIN_SIGNATURE_HEADER, signature);
  headers.set(ORIGIN_PUBLIC_HOST_HEADER, config.publicHost);
  if (clientIp) headers.set(ORIGIN_CLIENT_IP_HEADER, clientIp);
  return new Request(upstream, {
    method: request.method,
    headers,
    body: request.body,
    cache: 'no-store',
    redirect: 'manual',
    signal: request.signal,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
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
  if (!validPublicRequest(incoming, config)) {
    return new Response('Invalid public host.', { status: 403 });
  }
  if (!config.originToken || config.originToken.length < 32) {
    throw new Error('Worker origin credential is missing.');
  }
  try {
    const upstreamResponse = await transport(await originRequest(request, config, incoming));
    return originResponse(upstreamResponse);
  } catch (error) {
    if (request.signal.aborted) throw error;
    return new Response('Origin unavailable.', {
      status: error instanceof DOMException && error.name === 'TimeoutError' ? 504 : 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

function validPublicRequest(incoming: URL, config: WorkerOriginConfig): boolean {
  const localHttp =
    config.allowDevelopmentHttp &&
    incoming.protocol === 'http:' &&
    incoming.hostname === config.publicHost;
  return (localHttp || incoming.protocol === 'https:') && incoming.hostname === config.publicHost;
}
