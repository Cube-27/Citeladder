import { afterEach, expect, it, vi } from 'vite-plus/test';

import { withRequestLog } from './worker-request-log';

afterEach(() => vi.restoreAllMocks());

const callback =
  'https://app.citeladder.com/api/v1/integrations/oauth/callback?code=s3cret-code&state=s3cret-state#frag';
const callbackRequest = () =>
  new Request(callback, { headers: { 'cf-ray': '8f1e2d3c4b5a6978-LHR' } });

it('logs an OAuth callback by its path, ray and duration, never its code or state', async () => {
  vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_042);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const fetch = withRequestLog(async () => new Response(null, { status: 302 }));
  const response = await fetch(callbackRequest(), {});
  expect(response.status).toBe(302);
  expect(log.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
    {
      method: 'GET',
      host: 'app.citeladder.com',
      path: '/api/v1/integrations/oauth/callback',
      ray: '8f1e2d3c4b5a6978-LHR',
      duration_ms: 42,
      status: 302,
    },
  ]);
});

it('logs a failed request by its path and error name, then rethrows', async () => {
  vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_007);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetch = withRequestLog(async () => {
    throw new TypeError(`upstream refused ${callback}`);
  });
  await expect(fetch(callbackRequest(), {})).rejects.toThrow('upstream refused');
  expect(error.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
    {
      method: 'GET',
      host: 'app.citeladder.com',
      path: '/api/v1/integrations/oauth/callback',
      ray: '8f1e2d3c4b5a6978-LHR',
      duration_ms: 7,
      error: 'TypeError',
    },
  ]);
});
