import Anthropic, { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';

import { getLogger } from '../logging.ts';
import { ModelError, providerErrorCode, type Complete, type Transport } from './http.ts';

const logger = getLogger('app.connectors.agent.client');

/** Anthropic's own API; any other destination speaks OpenAI-compatible chat completions. */
export function isAnthropicEndpoint(endpoint: URL) {
  return endpoint.hostname === 'api.anthropic.com';
}

type Settings = {
  apiKey: string;
  model: string;
  timeoutSeconds: number;
  maxOutputTokens: number;
  attempts: number;
};

/** The SDK's failures as the gateway's own codes: no provider body or credential enters them. */
function modelError(error: unknown) {
  if (error instanceof ModelError) return error;
  if (error instanceof APIUserAbortError || error instanceof APIConnectionError)
    return new ModelError('connection');
  if (error instanceof APIError && error.status !== undefined) {
    logger.warning('default agent call failed', {
      status: error.status,
      error_code: providerErrorCode(error.status),
    });
    const retryAfter = error.headers?.get('retry-after') ?? undefined;
    return new ModelError('http', error.status, retryAfter);
  }
  // A stream that ends in an error event, or a response the SDK cannot read.
  return new ModelError(error instanceof APIError ? 'connection' : 'parse');
}

/**
 * Messages API calls through the official SDK. A schema is enforced as a
 * structured output; the reply always streams so a long answer never meets the
 * SDK's non-streaming time guard, and a listener sees the text as it arrives.
 */
export function anthropicCompletion(
  settings: Settings,
  transport: Transport,
  endpoint: URL,
): Complete {
  const client = new Anthropic({
    apiKey: settings.apiKey,
    // The SDK adds /v1 itself; a configured /v1 suffix is accepted.
    baseURL: endpoint.origin,
    timeout: settings.timeoutSeconds * 1000,
    maxRetries: Math.max(0, settings.attempts - 1),
    fetch: transport.fetch,
  });
  return async (system, user, signal, onText, schema) => {
    const started = performance.now();
    let text = '';
    let message;
    try {
      const stream = client.messages.stream(
        {
          model: settings.model,
          max_tokens: settings.maxOutputTokens,
          system,
          messages: [{ role: 'user', content: user }],
          ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
        },
        { signal },
      );
      if (onText)
        stream.on('text', (delta) => {
          text += delta;
          onText(text);
        });
      message = await stream.finalMessage();
    } catch (error) {
      throw modelError(error);
    }
    const content = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []));
    // A refusal or an empty turn carries no answer to read.
    if (!content.join('').trim()) throw new ModelError('parse');
    const latency = Math.round(performance.now() - started);
    logger.info('default agent call ok', { latency_ms: latency, model: settings.model });
    const { usage } = message;
    const cached = usage.cache_read_input_tokens ?? 0;
    return {
      content: content.join(''),
      provider_adapter: 'anthropic',
      endpoint_host: endpoint.hostname,
      requested_model: settings.model,
      returned_model: message.model || settings.model,
      finish_status: message.stop_reason ?? 'unknown',
      // Input counts every prompt token, cached or not, as OpenAI-compatible usage does.
      usage: {
        input_tokens: usage.input_tokens + cached + (usage.cache_creation_input_tokens ?? 0),
        output_tokens: usage.output_tokens,
        cached_input_tokens: cached,
      },
      latency_ms: latency,
    };
  };
}
