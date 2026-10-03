import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../../apps/docs/public/templates/citeladder-crawl-log-worker.js';
afterEach(() => vi.restoreAllMocks());
describe('customer Worker delivery', () => {
  it('captures origin status and preserves the visitor response on rejected ingestion', async () => {
    const response = new Response('visitor content', { status: 404 });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const work: Promise<void>[] = [];
    const returned = await worker.fetch(
      new Request('https://example.test/page?secret=remove', {
        headers: {
          'user-agent': 'GPTBot/1.0',
          'cf-connecting-ip': '192.0.2.1',
          'cf-ray': 'a1b2c3-LAX',
        },
      }),
      { CITELADDER_INGEST_URL: 'https://citeladder.test/ingest', CITELADDER_CRAWL_TOKEN: 'secret' },
      { waitUntil: (promise: Promise<void>) => work.push(promise) },
    );
    expect(returned).toBe(response);
    await Promise.all(work);
    const options = fetch.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({
      status: 404,
      path: '/page',
      request_id: 'a1b2c3',
    });
    expect(timeout.mock.calls[0]![0]).toBeGreaterThan(0);
    expect(timeout.mock.calls[0]![0]).toBeLessThan(30000);
    expect(error).toHaveBeenCalledWith('CiteLadder crawl log delivery failed', 429);
    expect(await returned.text()).toBe('visitor content');
    vi.unstubAllGlobals();
  });
  it('does not dispatch unmatched requests and tolerates failed sends', async () => {
    const response = new Response('ok');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(new Error('network'));
    vi.stubGlobal('fetch', fetch);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const work: Promise<void>[] = [];
    const ctx = { waitUntil: (p: Promise<void>) => work.push(p) };
    const env = { CITELADDER_INGEST_URL: 'https://example.test', CITELADDER_CRAWL_TOKEN: 'secret' };
    expect(await worker.fetch(new Request('https://example.test'), env, ctx)).toBe(response);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(work).toHaveLength(0);
    expect(
      await worker.fetch(
        new Request('https://example.test', { headers: { 'user-agent': 'ChatGPT-User/1.0' } }),
        env,
        ctx,
      ),
    ).toBe(response);
    await Promise.all(work);
    expect(error).toHaveBeenCalledWith('CiteLadder crawl log delivery failed');
    vi.unstubAllGlobals();
  });
});
