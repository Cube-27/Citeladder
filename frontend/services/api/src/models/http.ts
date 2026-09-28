import { setTimeout } from 'node:timers/promises';

export function providerErrorCode(status: number) {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth_failure';
  return status >= 500 ? 'server_error' : 'client_error';
}

/** Rate limits and transient gateway failures; never a deterministic 4xx/5xx. */
export const transientStatus = (status: number) => [429, 500, 502, 503, 504].includes(status);

/** A configured endpoint URL; an unparseable value is a configuration error. */
export function parseEndpoint(baseUrl: string) {
  try {
    return new URL(baseUrl);
  } catch {
    throw new ModelError('not_configured');
  }
}

/** `base` without trailing slashes, joined to an absolute `path`. */
export function endpointUrl(base: string, path: string) {
  let end = base.length;
  while (end > 0 && base[end - 1] === '/') end--;
  return `${base.slice(0, end)}${path}`;
}

export class ModelError extends Error {
  readonly code: 'not_configured' | 'parse' | 'http' | 'connection';
  readonly status: number | undefined;
  readonly retryAfter: string | undefined;
  constructor(code: ModelError['code'], status?: number, retryAfter?: string) {
    super(status === undefined ? `Model ${code}` : `Model returned HTTP ${status}`);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export type Transport = {
  fetch: typeof fetch;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};
export const defaultTransport: Transport = {
  fetch: globalThis.fetch,
  sleep: (milliseconds, signal) => setTimeout(milliseconds, undefined, { signal }),
};
export type RetryPolicy = {
  attempts: number;
  timeoutSeconds: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  retryStatus: (status: number) => boolean;
  retryConnection: boolean;
};

/** `Retry-After` as seconds (delta or HTTP date), or NaN when absent/invalid. */
function retryAfterSeconds(response: Response | undefined) {
  const header = response?.headers.get('retry-after');
  if (header == null) return Number.NaN;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : (Date.parse(header) - Date.now()) / 1000;
}

function retryDelay(response: Response | undefined, attempt: number, policy: RetryPolicy) {
  const after = retryAfterSeconds(response);
  return (
    Math.min(
      policy.maxDelaySeconds,
      Math.max(policy.baseDelaySeconds * 2 ** attempt, Number.isFinite(after) ? after : 0),
    ) * 1000
  );
}

/** No provider body, credential, or customer text enters an error. */
export async function postModel(
  url: string,
  apiKey: string,
  body: unknown,
  policy: RetryPolicy,
  transport: Transport,
  signal?: AbortSignal,
): Promise<Response> {
  const external = signal ? [signal] : [];
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    let response: Response | undefined;
    try {
      response = await transport.fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([AbortSignal.timeout(policy.timeoutSeconds * 1000), ...external]),
      });
      if (!policy.retryStatus(response.status) || attempt + 1 === policy.attempts) return response;
    } catch (error) {
      if (signal?.aborted) throw new ModelError('connection');
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      if ((!timedOut && !policy.retryConnection) || attempt + 1 === policy.attempts) {
        throw new ModelError('connection');
      }
    }
    await response?.body?.cancel();
    await backoff(transport, retryDelay(response, attempt, policy), signal);
  }
  throw new ModelError('connection');
}

/** Only an abort interrupts the backoff; the caller's deadline has passed. */
async function backoff(transport: Transport, milliseconds: number, signal?: AbortSignal) {
  try {
    await transport.sleep(milliseconds, signal);
  } catch {
    throw new ModelError('connection');
  }
}

export async function modelJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const seconds = retryAfterSeconds(response);
    throw new ModelError(
      'http',
      response.status,
      Number.isFinite(seconds) ? String(Math.max(1, Math.ceil(seconds))) : undefined,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ModelError('parse');
  }
}
