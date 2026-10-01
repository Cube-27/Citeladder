import { z } from 'zod';
import { providerErrorCode } from '../models/http.ts';
import { approvedEndpoint } from '../providers/connections.ts';
import { providerPolicy, type ProviderSettings } from '../providers/config.ts';
import { answerRequestSchema, ProviderError, type AnswerRequest } from './contracts.ts';
import { parseAnswer } from './parse.ts';

export function answerPayload(request: AnswerRequest): Record<string, unknown> {
  answerRequestSchema.parse(request);
  const catalog = providerPolicy.routes[request.logical_engine];
  if (
    catalog.transport_provider !== request.transport_provider ||
    catalog.transport_model !== request.transport_model
  )
    throw new ProviderError('invalid_route');
  const location = request.country_code
    ? { user_location: { type: 'approximate', country: request.country_code } }
    : {};
  if (request.transport_provider === 'openai')
    return {
      model: request.transport_model,
      input: request.prompt,
      store: false,
      max_output_tokens: request.max_output_tokens,
      ...(request.system_instruction ? { instructions: request.system_instruction } : {}),
      ...(request.reasoning_effort === 'off' ? { reasoning: { effort: 'none' } } : {}),
      ...(request.retrieval_enabled ? { tools: [{ type: 'web_search', ...location }] } : {}),
    };
  if (request.transport_provider === 'google')
    return {
      model: request.transport_model,
      input: request.prompt,
      store: false,
      system_instruction: request.system_instruction,
      max_output_tokens: request.max_output_tokens,
      ...(['minimal', 'low'].includes(request.reasoning_effort)
        ? { generation_config: { thinking_level: request.reasoning_effort } }
        : {}),
      ...(request.retrieval_enabled ? { tools: [{ type: 'google_search' }] } : {}),
    };
  return {
    model: request.transport_model,
    max_tokens: request.max_output_tokens,
    messages: [{ role: 'user', content: request.prompt }],
    ...(request.system_instruction ? { system: request.system_instruction } : {}),
    ...(request.reasoning_effort === 'off'
      ? { thinking: { type: 'disabled' } }
      : request.reasoning_effort === 'low'
        ? { output_config: { effort: 'low' } }
        : {}),
    ...(request.retrieval_enabled
      ? {
          tools: [
            {
              type: 'web_search_20250305',
              name: 'web_search',
              ...location,
              ...(request.anthropic_max_uses > 0 ? { max_uses: request.anthropic_max_uses } : {}),
            },
          ],
        }
      : {}),
  };
}

/** Exactly one paid call per attempt. Queue policy owns every retry. */
export async function executeAnswer(
  request: AnswerRequest,
  credential: { secret: string; base_url: string },
  settings: ProviderSettings,
  send: typeof fetch = globalThis.fetch,
  externalSignal?: AbortSignal,
) {
  const body = answerPayload(request);
  if (!credential.secret) throw new ProviderError('auth_failure');
  const url = approvedEndpoint(request.transport_provider, credential.base_url, settings);
  const headers: Record<string, string> =
    request.transport_provider === 'openai'
      ? { authorization: `Bearer ${credential.secret}` }
      : request.transport_provider === 'google'
        ? { 'x-goog-api-key': credential.secret }
        : { 'x-api-key': credential.secret, 'anthropic-version': settings.anthropicVersion };
  const signal = AbortSignal.any([
    AbortSignal.timeout(request.timeout_seconds * 1000),
    ...(externalSignal ? [externalSignal] : []),
  ]);
  const started = performance.now();
  let response: Response;
  try {
    response = await send(url, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
    });
  } catch {
    throw new ProviderError(signal.aborted ? 'timeout' : 'connection', true);
  }
  if (!response.ok) {
    await response.body?.cancel();
    const raw = response.headers.get('retry-after');
    const after =
      raw === null
        ? undefined
        : Number.isFinite(Number(raw))
          ? Math.max(0, Number(raw))
          : Math.max(0, (Date.parse(raw) - Date.now()) / 1000);
    throw new ProviderError(
      providerErrorCode(response.status),
      response.status === 429 || response.status >= 500,
      after !== undefined && Number.isFinite(after) ? after : undefined,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError(signal.aborted ? 'timeout' : 'parse_error', signal.aborted);
  }
  if (request.transport_provider === 'anthropic') {
    const parsed = z.object({ content: z.array(z.unknown()).optional() }).safeParse(payload);
    for (const block of parsed.data?.content ?? []) {
      const error = z
        .object({
          type: z.literal('web_search_tool_result'),
          content: z.object({
            type: z.literal('web_search_tool_result_error'),
            error_code: z.string(),
          }),
        })
        .safeParse(block).data;
      if (error?.content.error_code === 'too_many_requests')
        throw new ProviderError('rate_limit', true);
      if (error?.content.error_code === 'unavailable')
        throw new ProviderError('server_error', true);
    }
  }
  try {
    return parseAnswer(payload, request, Math.round(performance.now() - started));
  } catch {
    throw new ProviderError('parse_error');
  }
}
