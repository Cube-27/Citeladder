import { z } from 'zod';

import { policy, resolveSettingSpec } from '../config.ts';
import { getLogger } from '../logging.ts';
import { stripTrailing } from '../text-order.ts';
import {
  defaultTransport,
  endpointUrl,
  ModelError,
  modelJson,
  parseEndpoint,
  postModel,
  providerErrorCode,
  transientStatus,
  type Transport,
} from './http.ts';

export type GatewaySettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  maxOutputTokens: number;
  attempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
};

export function gatewaySettings(
  env: Record<string, string | undefined> = process.env,
): GatewaySettings {
  const spec = policy.models.gateway;
  const setting = (name: keyof typeof spec) => resolveSettingSpec(spec[name], env);
  return {
    apiKey: String(setting('api_key')).trim(),
    baseUrl: String(setting('base_url')).trim(),
    model: String(setting('model')).trim(),
    timeoutSeconds: Number(setting('timeout_seconds')),
    maxOutputTokens: Number(setting('max_output_tokens')),
    attempts: policy.models.max_attempts,
    baseDelaySeconds: Number(setting('retry_base_delay_seconds')),
    maxDelaySeconds: Number(setting('retry_max_delay_seconds')),
  };
}

const completionChoice = z.object({
  message: z.object({ content: z.string().trim().min(1) }),
  finish_reason: z.string().nullish(),
});
const completion = z.object({
  model: z.string().optional(),
  // At least one choice: the first is the answer.
  choices: z.tuple([completionChoice], completionChoice),
  usage: z.record(z.string(), z.unknown()).optional(),
});
const streamChunk = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullish() }).nullish(),
        finish_reason: z.string().nullish(),
      }),
    )
    .optional(),
  usage: z.record(z.string(), z.unknown()).nullish(),
});
type Completion = z.infer<typeof completion>;

/**
 * An OpenAI-compatible event stream folded into the buffered completion shape,
 * so settlement and parsing never depend on how the text arrived.
 */
async function streamedCompletion(
  response: Response,
  onText: (content: string) => void,
): Promise<Completion> {
  if (!response.body) throw new ModelError('parse');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let content = '';
  let model: string | undefined;
  let finish: string | null = null;
  let usage: Record<string, unknown> | undefined;
  const line = (raw: string) => {
    const data = raw.startsWith('data:') ? raw.slice(5).trim() : '';
    if (!data || data === '[DONE]') return;
    let chunk;
    try {
      chunk = streamChunk.parse(JSON.parse(data));
    } catch {
      throw new ModelError('parse');
    }
    model = chunk.model ?? model;
    usage = chunk.usage ?? usage;
    const choice = chunk.choices?.[0];
    content += choice?.delta?.content ?? '';
    finish = choice?.finish_reason ?? finish;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) line(raw.trim());
    onText(content);
  }
  line(buffer.trim());
  return completion.parse({
    model,
    choices: [{ message: { content }, finish_reason: finish }],
    usage,
  });
}

const logger = getLogger('app.connectors.agent.client');

/** OpenAI-compatible providers name an output-cap stop either way. */
export function truncatedFinish(finishStatus: string) {
  return finishStatus === 'length' || finishStatus === 'max_tokens';
}
/** The provider's answer, folded from its stream when a listener asked for one. */
async function readCompletion(
  response: Response,
  onText?: (content: string) => void,
): Promise<Completion> {
  // A provider may ignore the stream request; its JSON answer is read as usual.
  if (onText && response.ok && response.headers.get('content-type')?.includes('event-stream')) {
    try {
      return await streamedCompletion(response, onText);
    } catch (error) {
      if (error instanceof ModelError) throw error;
      // A dropped stream is a connection failure, which the caller may retry.
      throw new ModelError('connection');
    }
  }
  const parsed = completion.safeParse(await modelJson(response));
  if (!parsed.success) throw new ModelError('parse');
  return parsed.data;
}
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Model text without a leading ``` / ```json fence or a trailing ``` fence. */
function unfenced(content: string) {
  let text = content.trim();
  if (text.startsWith('```')) {
    text = text.slice(3);
    if (text.slice(0, 4).toLowerCase() === 'json') text = text.slice(4);
  }
  if (text.endsWith('```')) text = text.slice(0, -3);
  return text.trim();
}

function normalizedUsage(raw: Record<string, unknown> | undefined) {
  const usage: Record<string, number | null> = {};
  const nested = (name: string, field: string) => {
    const details = raw?.[name];
    return details && typeof details === 'object' ? Reflect.get(details, field) : undefined;
  };
  const fallback: Record<string, unknown> = {
    cached_input_tokens: nested('prompt_tokens_details', 'cached_tokens'),
    reasoning_tokens: nested('completion_tokens_details', 'reasoning_tokens'),
  };
  for (const [target, aliases] of Object.entries({
    input_tokens: ['input_tokens', 'prompt_tokens'],
    output_tokens: ['output_tokens', 'completion_tokens'],
    total_tokens: ['total_tokens'],
    cached_input_tokens: ['cached_input_tokens'],
    reasoning_tokens: ['reasoning_tokens'],
  })) {
    const alias = aliases.find((name) => raw && Object.hasOwn(raw, name));
    const value = alias ? raw?.[alias] : fallback[target];
    if (value !== undefined)
      usage[target] =
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return usage;
}

export function createModelGateway(
  settings = gatewaySettings(),
  transport: Transport = defaultTransport,
) {
  if (![settings.apiKey, settings.baseUrl, settings.model].every((part) => part.trim())) {
    throw new ModelError('not_configured');
  }
  const endpoint = parseEndpoint(settings.baseUrl);
  // Plain HTTP would expose the key and business context; allow it only locally.
  const secure =
    endpoint.protocol === 'https:' ||
    (endpoint.protocol === 'http:' && LOOPBACK_HOSTS.has(endpoint.hostname));
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !secure) {
    throw new ModelError('not_configured');
  }
  let legacyCap = false;
  const retry = { ...settings, retryStatus: transientStatus, retryConnection: true };
  const base = stripTrailing(endpoint.href, '/');
  const url = base.endsWith('/chat/completions') ? base : endpointUrl(base, '/chat/completions');
  async function complete(
    system: string,
    user: string,
    signal?: AbortSignal,
    onText?: (content: string) => void,
  ) {
    // A listener asks for a stream; the caller gives one only to transports that pass it through.
    const stream = Boolean(onText);
    const started = performance.now();
    // Retries share one call's timeout, the envelope of a single provider call.
    const deadline = AbortSignal.any([
      AbortSignal.timeout(settings.timeoutSeconds * 1000),
      ...(signal ? [signal] : []),
    ]);
    const send = (legacy: boolean) =>
      postModel(
        url,
        settings.apiKey,
        {
          model: settings.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          [legacy ? 'max_tokens' : 'max_completion_tokens']: settings.maxOutputTokens,
          ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
        },
        retry,
        transport,
        deadline,
      );
    let response = await send(legacyCap);
    if (
      !legacyCap &&
      [400, 422].includes(response.status) &&
      (await response.clone().text()).includes('max_completion_tokens')
    ) {
      response = await send(true);
      if (response.ok) legacyCap = true;
    }
    if (!response.ok)
      logger.warning('default agent call failed', {
        status: response.status,
        model: settings.model,
        error_code: providerErrorCode(response.status),
      });
    const body = await readCompletion(response, stream ? onText : undefined);
    const usage = normalizedUsage(body.usage);
    const latency = Math.round(performance.now() - started);
    logger.info('default agent call ok', { latency_ms: latency, model: settings.model });
    return {
      content: body.choices[0].message.content,
      provider_adapter: 'openai_compatible',
      endpoint_host: endpoint.hostname,
      requested_model: settings.model,
      returned_model: body.model || settings.model,
      finish_status: body.choices[0].finish_reason ?? 'unknown',
      usage,
      latency_ms: latency,
    };
  }
  return {
    model: settings.model,
    baseUrlHost: endpoint.hostname,
    complete,
    async completeStructured(
      system: string,
      user: string,
      schema: Record<string, unknown>,
      signal?: AbortSignal,
      onText?: (content: string) => void,
    ) {
      const result = await complete(
        system,
        `${user}\n\nReturn only JSON matching this schema:\n${JSON.stringify(schema)}`,
        signal,
        onText,
      );
      return { ...result, content: unfenced(result.content) };
    },
    async structured<T>(system: string, user: string, schema: z.ZodType<T>, signal?: AbortSignal) {
      const result = await complete(
        system,
        `${user}\n\nReturn only JSON matching this schema:\n${JSON.stringify(z.toJSONSchema(schema))}`,
        signal,
      );
      try {
        return { value: schema.parse(JSON.parse(unfenced(result.content))), result };
      } catch {
        throw new ModelError('parse');
      }
    },
  };
}
export type ModelGateway = ReturnType<typeof createModelGateway>;
