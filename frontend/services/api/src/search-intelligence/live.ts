import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ProviderError } from '../answer-engines/contracts.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { providerSettings } from '../providers/config.ts';
import { approvedEndpoint } from '../providers/connections.ts';
import { boundedJson } from '../providers/response.ts';
import { providerErrorCode } from '../models/http.ts';
import { canonicalJson, si } from './requests.ts';
import { record } from '../db/json.ts';

export type ResearchResponse = {
  body: Record<string, unknown>;
  hash: string;
  taskId: string;
  cost: string | null;
};
const numericCost = (value: unknown) =>
  (typeof value === 'number' || typeof value === 'string') &&
  String(value).trim() &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? String(value)
    : null;
/** One paid Live POST; classification and bounded retries belong to persisted dispatch evidence. */
export async function executeLive(
  input: {
    encryptedSecret: string;
    encryptionKey: string;
    endpoint: string;
    payload: Record<string, unknown>;
    baseUrl: string;
  },
  options: {
    send?: typeof fetch;
    env?: Record<string, string | undefined>;
    signal?: AbortSignal;
  } = {},
): Promise<ResearchResponse> {
  if (
    ![...Object.values(si.endpoints), ...Object.values(si.broad_endpoints)].includes(input.endpoint)
  )
    throw new ProviderError('client_error');
  let pair: { login: string; password: string };
  try {
    pair = z
      .object({ login: z.string().min(1), password: z.string().min(1) })
      .parse(JSON.parse(createSecretCipher(input.encryptionKey).decrypt(input.encryptedSecret)));
  } catch {
    throw new ProviderError('auth_failure');
  }
  const base = approvedEndpoint('dataforseo', input.baseUrl, providerSettings(options.env));
  const signal = AbortSignal.any([
    AbortSignal.timeout(si.provider_timeout_seconds * 1000),
    ...(options.signal ? [options.signal] : []),
  ]);
  let response: Response;
  try {
    response = await (options.send ?? fetch)(`${base}${input.endpoint}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${pair.login}:${pair.password}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([input.payload]),
      redirect: 'error',
      signal,
    });
  } catch {
    throw new ProviderError(signal.aborted ? 'timeout' : 'connection');
  }
  if (!response.ok) {
    const header = response.headers.get('retry-after'),
      seconds = header ? Number(header) : NaN;
    const wait = Number.isFinite(seconds)
      ? Math.max(0, seconds)
      : header
        ? Math.max(0, (Date.parse(header) - Date.now()) / 1000)
        : NaN;
    await response.body?.cancel();
    throw new ProviderError(
      providerErrorCode(response.status),
      false,
      Number.isFinite(wait) ? wait : undefined,
    );
  }
  let body: Record<string, unknown>;
  try {
    body = record(await boundedJson(response, si.provider_max_response_bytes, signal));
  } catch {
    throw new ProviderError(signal.aborted ? 'timeout' : 'parse_error');
  }
  const tasks = body.tasks;
  if (
    body.status_code !== 20000 ||
    !Array.isArray(tasks) ||
    tasks.length !== 1 ||
    record(tasks[0]).status_code !== 20000
  )
    throw new ProviderError('parse_error');
  const task = record(tasks[0]);
  const utf8Canonical = canonicalJson(body, false);
  return {
    body,
    hash: createHash('sha256').update(utf8Canonical).digest('hex'),
    taskId: String(task.id ?? '').slice(0, 255),
    cost: numericCost(task.cost) ?? numericCost(body.cost),
  };
}
