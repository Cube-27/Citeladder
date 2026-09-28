import { setTimeout } from 'node:timers/promises';

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
  sleep: (milliseconds: number) => Promise<void>;
};
export const defaultTransport: Transport = { fetch: globalThis.fetch, sleep: setTimeout };
export type RetryPolicy = {
  attempts: number;
  timeoutSeconds: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  retryStatus: (status: number) => boolean;
  retryConnection: boolean;
};

function retryDelay(response: Response | undefined, attempt: number, policy: RetryPolicy) {
  const header = response?.headers.get('retry-after');
  const seconds = header == null ? 0 : Number(header);
  const after = Number.isFinite(seconds) ? seconds : (Date.parse(header!) - Date.now()) / 1000;
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
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    let response: Response | undefined;
    try {
      response = await transport.fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          AbortSignal.timeout(policy.timeoutSeconds * 1000),
          ...(signal ? [signal] : []),
        ]),
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
    await transport.sleep(retryDelay(response, attempt, policy));
  }
  throw new ModelError('connection');
}

export async function modelJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const header = response.headers.get('retry-after');
    const numeric = header === null ? NaN : Number(header);
    const seconds = Number.isFinite(numeric)
      ? numeric
      : (Date.parse(header ?? '') - Date.now()) / 1000;
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
