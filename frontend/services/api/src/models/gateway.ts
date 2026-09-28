import { z } from 'zod';

import { policy, resolveSettingSpec } from '../config.ts';
import { getLogger } from '../logging.ts';
import { defaultTransport, ModelError, modelJson, postModel, type Transport } from './http.ts';

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

const completion = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().trim().min(1) }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
});
const logger = getLogger('app.connectors.agent.client');

export function createModelGateway(
  settings = gatewaySettings(),
  transport: Transport = defaultTransport,
) {
  if (![settings.apiKey, settings.baseUrl, settings.model].every((part) => part.trim())) {
    throw new ModelError('not_configured');
  }
  const endpoint = new URL(settings.baseUrl);
  if (endpoint.username || endpoint.password || !['https:', 'http:'].includes(endpoint.protocol)) {
    throw new ModelError('not_configured');
  }
  let legacyCap = false;
  const retry = {
    ...settings,
    retryStatus: (status: number) => status === 429 || status >= 500,
    retryConnection: true,
  };
  const url = `${settings.baseUrl.replace(/\/+$/u, '')}/chat/completions`;
  async function complete(system: string, user: string) {
    const started = performance.now();
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
        },
        retry,
        transport,
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
        error_code:
          response.status === 429
            ? 'rate_limit'
            : response.status >= 500
              ? 'server_error'
              : 'client_error',
      });
    const parsed = completion.safeParse(await modelJson(response));
    if (!parsed.success) throw new ModelError('parse');
    const body = parsed.data;
    const usage: Record<string, number> = {};
    for (const [target, aliases] of Object.entries({
      input_tokens: ['input_tokens', 'prompt_tokens'],
      output_tokens: ['output_tokens', 'completion_tokens'],
      total_tokens: ['total_tokens'],
    })) {
      for (const alias of aliases) {
        const value = body.usage?.[alias];
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
          usage[target] = value;
          break;
        }
      }
    }
    const latency = Math.round(performance.now() - started);
    logger.info('default agent call ok', { latency_ms: latency, model: settings.model });
    return {
      content: body.choices[0]!.message.content,
      provider_adapter: 'openai_compatible',
      endpoint_host: endpoint.hostname,
      requested_model: settings.model,
      returned_model: body.model || settings.model,
      finish_status: body.choices[0]!.finish_reason ?? 'unknown',
      usage,
      latency_ms: latency,
    };
  }
  return {
    model: settings.model,
    baseUrlHost: endpoint.hostname,
    complete,
    async structured<T>(system: string, user: string, schema: z.ZodType<T>) {
      const result = await complete(
        system,
        `${user}\n\nReturn only JSON matching this schema:\n${JSON.stringify(z.toJSONSchema(schema))}`,
      );
      try {
        const text = result.content.replace(/^```(?:json)?\s*\n?/iu, '').replace(/\s*```$/u, '');
        return { value: schema.parse(JSON.parse(text)), result };
      } catch {
        throw new ModelError('parse');
      }
    },
  };
}
export type ModelGateway = ReturnType<typeof createModelGateway>;
