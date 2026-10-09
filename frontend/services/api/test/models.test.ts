import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { createJevClient, jevSettings } from '../src/models/jev.ts';

const settings = {
  ...gatewaySettings({}),
  apiKey: 'test-only',
  baseUrl: 'https://model.test/v1',
  model: 'test',
};
const reply = () =>
  Response.json({
    model: 'returned-model',
    choices: [{ message: { content: '```json\n{"answer":42}\n```' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 5 },
  });
function transport(responses: Response[]) {
  return {
    fetch: vi.fn<typeof fetch>(async () => {
      const response = responses.shift();
      if (!response) throw new Error('Unexpected network call');
      return response;
    }),
    sleep: vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => {}),
  };
}

describe('configured model gateway', () => {
  it('cancels structured generation in flight without retrying the provider', async () => {
    const controller = new AbortController();
    const io = {
      fetch: vi.fn<typeof fetch>(async (_url, init) => {
        controller.abort();
        init!.signal!.throwIfAborted();
        return reply();
      }),
      sleep: vi.fn(async () => {}),
    };
    await expect(
      createModelGateway(settings, io).structured('s', 'u', z.object({}), controller.signal),
    ).rejects.toMatchObject({ code: 'connection' });
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(io.sleep).not.toHaveBeenCalled();
  });
  it('preserves invalid usage as unknown and honors the caller cancellation signal', async () => {
    const io = transport([
      Response.json({
        choices: [{ message: { content: '{}' } }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          cached_input_tokens: null,
          completion_tokens_details: { reasoning_tokens: 3 },
        },
      }),
    ]);
    const gateway = createModelGateway(
      { ...settings, baseUrl: 'https://model.test/v1/chat/completions/' },
      io,
    );
    expect((await gateway.completeStructured('s', 'u', {})).usage).toEqual({
      input_tokens: 20,
      output_tokens: 10,
      cached_input_tokens: null,
      reasoning_tokens: 3,
    });
    expect(String(io.fetch.mock.calls[0]![0])).toBe('https://model.test/v1/chat/completions');
    expect(() =>
      createModelGateway({ ...settings, baseUrl: 'https://model.test/v1?secret=value' }, io),
    ).toThrow('not_configured');
    const abort = new AbortController();
    abort.abort();
    const cancelled = {
      fetch: vi.fn<typeof fetch>(async (_url, init) => {
        expect(init?.signal?.aborted).toBe(true);
        throw new DOMException('Aborted', 'AbortError');
      }),
      sleep: vi.fn(async () => {}),
    };
    await expect(
      createModelGateway(settings, cancelled).complete('s', 'u', abort.signal),
    ).rejects.toMatchObject({ code: 'connection' });
    expect(cancelled.fetch).toHaveBeenCalledTimes(1);
  });
  it('streams text to a listener and settles the same result as a buffered call', async () => {
    const frames = [
      { model: 'returned-model', choices: [{ delta: { content: '{"answer":' } }] },
      { choices: [{ delta: { content: '42}' }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } },
    ];
    const sse = `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')}data: [DONE]\n\n`;
    const io = transport([
      new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
      reply(),
    ]);
    const gateway = createModelGateway(settings, io);
    const seen: string[] = [];
    const streamed = await gateway.complete('s', 'u', undefined, (text) => seen.push(text));
    expect(seen.at(-1)).toBe('{"answer":42}');
    expect(streamed).toMatchObject({
      content: '{"answer":42}',
      finish_status: 'stop',
      returned_model: 'returned-model',
      usage: { input_tokens: 12, output_tokens: 5 },
    });
    expect(JSON.parse(String(io.fetch.mock.calls[0]![1]!.body))).toMatchObject({ stream: true });
    // Without a listener the request stays buffered.
    await gateway.complete('s', 'u');
    expect(JSON.parse(String(io.fetch.mock.calls[1]![1]!.body)).stream).toBeUndefined();
  });
  it('validates structured JSON and records actual model and usage', async () => {
    const io = transport([reply()]);
    const gateway = createModelGateway(settings, io);
    const result = await gateway.structured('system', 'question', z.object({ answer: z.number() }));
    expect(result.value.answer).toBe(42);
    expect(result.result).toMatchObject({
      returned_model: 'returned-model',
      usage: { input_tokens: 12, output_tokens: 5 },
    });
    const sent = JSON.parse(String(io.fetch.mock.calls[0]![1]!.body));
    expect(sent.messages[1].content).toContain('"answer"');
  });

  it('falls back only for a named output-cap rejection and remembers success', async () => {
    const io = transport([
      new Response('unsupported max_completion_tokens', { status: 400 }),
      reply(),
      reply(),
    ]);
    const gateway = createModelGateway(settings, io);
    await gateway.complete('system', 'question');
    await gateway.complete('system', 'next');
    const bodies = io.fetch.mock.calls.map((call) => JSON.parse(String(call[1]!.body)));
    expect(bodies.map((body) => Object.hasOwn(body, 'max_tokens'))).toEqual([false, true, true]);
    const refused = transport([new Response('invalid model', { status: 400 })]);
    await expect(createModelGateway(settings, refused).complete('s', 'u')).rejects.toMatchObject({
      status: 400,
    });
    expect(refused.fetch).toHaveBeenCalledTimes(1);
  });

  it('holds structured calls to a strict schema and remembers a destination that refuses one', async () => {
    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false };
    const io = transport([
      new Response('unsupported response_format', { status: 400 }),
      reply(),
      reply(),
    ]);
    const gateway = createModelGateway(settings, io);
    await gateway.completeStructured('system', 'question', schema);
    await gateway.completeStructured('system', 'next', schema);
    const bodies = io.fetch.mock.calls.map((call) => JSON.parse(String(call[1]!.body)));
    expect(bodies[0].response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'response', strict: true, schema },
    });
    expect(bodies[0].messages[1].content).toBe('question');
    // The refusing destination is asked with the schema in the prompt, now and later.
    expect(bodies.slice(1).map((body) => body.response_format)).toEqual([undefined, undefined]);
    expect(bodies[2].messages[1].content).toBe(
      `next\n\nReturn only JSON matching this schema:\n${JSON.stringify(schema)}`,
    );
  });

  it('speaks the Messages API when the base URL is Anthropic, with the schema enforced', async () => {
    const frames = [
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-haiku-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 4 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"answer":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '42}' } },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 5 },
      },
      { type: 'message_stop' },
    ];
    const sse = frames
      .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
      .join('');
    const io = transport([
      new Response(sse, { headers: { 'content-type': 'text/event-stream' } }),
      Response.json(
        { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
        { status: 429, headers: { 'retry-after': '7' } },
      ),
    ]);
    const anthropic = { ...settings, baseUrl: 'https://api.anthropic.com/v1', attempts: 1 };
    const gateway = createModelGateway(anthropic, io);
    const schema = { type: 'object', properties: {}, required: [], additionalProperties: false };
    const seen: string[] = [];
    const result = await gateway.completeStructured(
      'system',
      'question',
      schema,
      undefined,
      (text) => seen.push(text),
    );
    expect(result).toMatchObject({
      content: '{"answer":42}',
      provider_adapter: 'anthropic',
      returned_model: 'claude-haiku-5-5',
      finish_status: 'end_turn',
      usage: { input_tokens: 14, output_tokens: 5, cached_input_tokens: 4 },
    });
    expect(seen.at(-1)).toBe('{"answer":42}');
    const [url, init] = io.fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(new Headers(init!.headers).get('x-api-key')).toBe('test-only');
    expect(JSON.parse(String(init!.body))).toMatchObject({
      model: 'test',
      system: 'system',
      messages: [{ role: 'user', content: 'question' }],
      output_config: { format: { type: 'json_schema', schema } },
    });
    // Provider failures keep the gateway's codes, so retry decisions stay the same.
    await expect(gateway.complete('system', 'next')).rejects.toMatchObject({
      code: 'http',
      status: 429,
      retryAfter: '7',
    });
  });

  it('retries rate limits with Retry-After and transient server errors', async () => {
    const io = transport([
      new Response(null, { status: 429, headers: { 'retry-after': '7' } }),
      new Response(null, { status: 503 }),
      reply(),
    ]);
    await createModelGateway(settings, io).complete('s', 'u');
    expect(io.sleep.mock.calls.map(([delay]) => delay)).toEqual([7000, 4000]);
  });

  it('preserves a bounded retry hint when provider retries are exhausted', async () => {
    const io = transport(
      Array.from(
        { length: settings.attempts },
        () => new Response(null, { status: 429, headers: { 'retry-after': '12' } }),
      ),
    );
    await expect(createModelGateway(settings, io).complete('s', 'u')).rejects.toMatchObject({
      status: 429,
      retryAfter: '12',
    });
    expect(io.fetch).toHaveBeenCalledTimes(settings.attempts);
  });

  it('refuses unparseable output and missing configuration without retry', async () => {
    const io = transport([Response.json({ choices: [] })]);
    await expect(createModelGateway(settings, io).complete('s', 'u')).rejects.toMatchObject({
      code: 'parse',
    });
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(() => createModelGateway(gatewaySettings({}), io)).toThrow('not_configured');
    expect(() => createModelGateway({ ...settings, baseUrl: 'model.test/v1' }, io)).toThrow(
      'not_configured',
    );
    const plain = { ...settings, baseUrl: 'http://model.test/v1' };
    expect(() => createModelGateway(plain, io)).toThrow('not_configured');
    expect(() =>
      createModelGateway({ ...plain, baseUrl: 'http://127.0.0.1:11434/v1' }, io),
    ).not.toThrow();
    const invalid = transport([Response.json({ choices: [{ message: { content: 'not JSON' } }] })]);
    await expect(
      createModelGateway(settings, invalid).structured('s', 'u', z.object({})),
    ).rejects.toMatchObject({ code: 'parse' });
  });
});

describe('JEV transport', () => {
  const configured = { ...jevSettings({}), apiKey: 'test-only' };
  it.each(['https://model.test?token=fixture', 'https://model.test#fragment'])(
    'refuses an ambiguous endpoint before sending credentials (%s)',
    (baseUrl) => {
      const io = transport([]);
      expect(() => createJevClient({ ...configured, baseUrl }, io)).toThrow('not_configured');
      expect(io.fetch).not.toHaveBeenCalled();
    },
  );
  it('is off without a key and returns typed answer records when enabled', async () => {
    expect(createJevClient(jevSettings({}))).toBeNull();
    const io = transport([
      Response.json({ model: 'jev-test', answers: { fit: { probability: 0.9 } } }),
    ]);
    expect(
      await createJevClient(configured, io)!.decide({ question: 'shoe?' }, { fit: {} }),
    ).toMatchObject({ answers: { fit: { probability: 0.9 } } });
  });
  it('retries overload but refuses ordinary server, auth and malformed responses', async () => {
    const io = transport([
      new Response(null, { status: 529, headers: { 'retry-after': '500' } }),
      Response.json({ answers: {} }),
    ]);
    await createJevClient(configured, io)!.decide({}, {});
    expect(io.sleep.mock.calls.map(([delay]) => delay)).toEqual([10_000]);
    for (const status of [401, 500]) {
      const failed = transport([new Response(null, { status })]);
      await expect(createJevClient(configured, failed)!.decide({}, {})).rejects.toMatchObject({
        status,
      });
      expect(failed.fetch).toHaveBeenCalledTimes(1);
    }
    const invalid = transport([Response.json({ answers: [] })]);
    await expect(createJevClient(configured, invalid)!.decide({}, {})).rejects.toMatchObject({
      code: 'parse',
    });
  });
  it('stops retrying when the generation deadline passes during backoff', async () => {
    const deadline = new AbortController();
    const io = transport([new Response(null, { status: 503 })]);
    io.sleep.mockImplementationOnce(async (_milliseconds, signal) => {
      deadline.abort();
      signal?.throwIfAborted();
    });
    await expect(
      createJevClient(configured, io)!.decide({}, {}, deadline.signal),
    ).rejects.toMatchObject({ code: 'connection' });
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });
});
