import { describe, expect, it } from 'vitest';
import { providerPolicy, providerSettings } from '../src/providers/config.ts';
import { answerRequestSchema, type AnswerRequest } from '../src/answer-engines/contracts.ts';
import { answerPayload, executeAnswer } from '../src/answer-engines/execute.ts';
import { parseAnswer, usageCount } from '../src/answer-engines/parse.ts';

function request(engine: 'chatgpt' | 'gemini' | 'claude', retrieval = true): AnswerRequest {
  const route = providerPolicy.routes[engine];
  return answerRequestSchema.parse({
    logical_engine: engine,
    transport_provider: route.transport_provider,
    transport_model: route.transport_model,
    prompt: 'Which options fit a small team?',
    system_instruction: 'Answer neutrally.',
    retrieval_enabled: retrieval,
    max_output_tokens: 512,
    timeout_seconds: 1,
    reasoning_effort: route.reasoning_effort,
    country_code: 'AU',
    anthropic_max_uses: 0,
  });
}
describe('frozen answer-engine execution', () => {
  it.each(['chatgpt', 'gemini', 'claude'] as const)(
    'runs %s with fresh policy and no tools when retrieval is off',
    async (engine) => {
      const input = request(engine, false);
      const body = answerPayload(input);
      expect(body).not.toHaveProperty('tools');
      expect(body).not.toHaveProperty('previous_response_id');
      expect(body).not.toHaveProperty('previous_interaction_id');
      let calls = 0;
      const send: typeof fetch = async (_url, options) => {
        calls++;
        expect(options?.redirect).toBe('error');
        expect(JSON.parse(String(options?.body))).toEqual(body);
        return Response.json(
          engine === 'chatgpt'
            ? {
                status: 'completed',
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer.' }] }],
              }
            : engine === 'gemini'
              ? {
                  finish_reason: 'STOP',
                  steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Answer.' }] }],
                }
              : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Answer.' }] },
        );
      };
      const result = await executeAnswer(
        input,
        { secret: 'test-secret', base_url: '' },
        providerSettings({}),
        send,
      );
      expect(result).toMatchObject({
        answer_text: 'Answer.',
        finish_reason: 'stop',
        search_used: false,
      });
      expect(result.normalized_usage.output_tokens).toBeNull();
      expect(calls).toBe(1);
    },
  );

  it('keeps OpenAI calls grouped, offsets exact and reasoning content excluded', () => {
    const result = parseAnswer(
      {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [
          { type: 'reasoning', text: 'private-reasoning' },
          { type: 'web_search_call', id: 's1', action: { queries: ['first', 'second'] } },
          { type: 'web_search_call', id: 's2' },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: '😀 Brand choice',
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://www.publisher.example/page',
                    start_index: 2,
                    end_index: 7,
                  },
                  {
                    type: 'url_citation',
                    url: 'https://publisher.example/other',
                    start_index: 1,
                    end_index: 999,
                  },
                ],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 40,
          input_tokens_details: { cached_tokens: 10 },
          output_tokens: 30,
          output_tokens_details: { reasoning_tokens: 7 },
        },
      },
      request('chatgpt'),
    );
    expect(result).toMatchObject({
      finish_reason: 'length',
      normalized_usage: {
        uncached_input_tokens: 30,
        cached_input_tokens: 10,
        output_tokens: 23,
        reasoning_tokens: 7,
        web_search_requests: 2,
      },
    });
    expect(result.search_events.map((event) => [event.query, event.call_sequence])).toEqual([
      ['first', 0],
      ['second', 0],
      ['', 1],
    ]);
    expect(result.citations[0]?.cited_text).toBe('Brand');
    expect(result.citations[1]).toMatchObject({
      start_index: null,
      end_index: null,
      cited_text: '',
    });
    expect(JSON.stringify(result)).not.toContain('private-reasoning');
  });

  it('keeps Google redirect identity and counts calls even without usable queries', () => {
    const result = parseAnswer(
      {
        finishReason: 'SAFETY',
        steps: [
          { type: 'thought', signature: 'private-signature', content: 'private-thought' },
          { type: 'google_search_call', arguments: { queries: 'malformed' } },
          {
            type: 'model_output',
            content: [
              {
                type: 'text',
                text: 'Brand is an option.',
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://vertexaisearch.cloud.google.com/token',
                    title: 'www.publisher.example',
                    startIndex: 0,
                    endIndex: 5,
                  },
                ],
              },
            ],
          },
        ],
        usage: {
          promptTokenCount: 'bad',
          prompt_token_count: 99,
          candidatesTokenCount: 0,
          thoughtsTokenCount: 4,
        },
      },
      request('gemini'),
    );
    expect(result).toMatchObject({
      finish_reason: 'content_filter',
      search_used: true,
      search_events: [],
      normalized_usage: {
        uncached_input_tokens: null,
        output_tokens: 0,
        reasoning_tokens: 4,
        web_search_requests: 1,
      },
    });
    expect(result.citations[0]).toMatchObject({
      domain: 'publisher.example',
      cited_text: 'Brand',
      url: 'https://vertexaisearch.cloud.google.com/token',
    });
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('includes Anthropic cache writes and honors reported zero search activity', () => {
    const result = parseAnswer(
      {
        stop_reason: 'pause_turn',
        content: [
          { type: 'server_tool_use', name: 'web_search', input: { query: 'options' } },
          {
            type: 'text',
            text: 'Answer',
            citations: [
              {
                type: 'web_search_result_location',
                url: 'https://publisher.example/',
                cited_text: 'Evidence',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 10,
          cacheCreationInputTokens: 5,
          cacheReadInputTokens: 20,
          output_tokens: 7,
          server_tool_use: { web_search_requests: 0 },
        },
      },
      request('claude'),
    );
    expect(result).toMatchObject({
      finish_reason: 'unknown',
      search_used: false,
      normalized_usage: {
        uncached_input_tokens: 15,
        cached_input_tokens: 20,
        total_tokens: 42,
        reasoning_tokens: null,
      },
    });
    expect(result.citations[0]).toMatchObject({
      cited_text: 'Evidence',
      start_index: null,
      end_index: null,
    });
  });

  it('leaves retryable HTTP and embedded search errors to the queue without echoing bodies', async () => {
    let calls = 0;
    const send: typeof fetch = async () => {
      calls++;
      return Response.json(
        { secret: 'must-not-echo' },
        { status: 429, headers: { 'retry-after': '3' } },
      );
    };
    await expect(
      executeAnswer(
        request('claude'),
        { secret: 'test-secret', base_url: '' },
        providerSettings({}),
        send,
      ),
    ).rejects.toMatchObject({ code: 'rate_limit', retryable: true, retryAfterSeconds: 3 });
    expect(calls).toBe(1);
    await expect(
      executeAnswer(
        request('claude'),
        { secret: 'test-secret', base_url: '' },
        providerSettings({}),
        async () =>
          Response.json({
            content: [
              {
                type: 'web_search_tool_result',
                content: {
                  type: 'web_search_tool_result_error',
                  error_code: 'unavailable',
                },
              },
            ],
          }),
      ),
    ).rejects.toMatchObject({ code: 'server_error', retryable: true });
  });

  it('cancels an oversized successful response and reports only the safe parser error', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"private":"secret"}'));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    await expect(
      executeAnswer(
        request('claude'),
        { secret: 'test-secret', base_url: '' },
        { ...providerSettings({}), maxResponseBytes: 4 },
        async () => response,
      ),
    ).rejects.toMatchObject({ code: 'parse_error', retryable: false });
    expect(cancelled).toBe(true);
  });

  it.each([true, -1, 1.5, '', '1.5', 'NaN', {}, null])(
    'keeps malformed usage %j unknown',
    (value) => {
      expect(usageCount(value)).toBeNull();
    },
  );
});
