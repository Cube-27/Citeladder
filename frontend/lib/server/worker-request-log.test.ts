import { afterEach, expect, it, vi } from 'vite-plus/test';

import { withRequestLog } from './worker-request-log';

afterEach(() => vi.restoreAllMocks());

const callback =
  'https://app.citeladder.com/api/v1/integrations/oauth/callback?code=s3cret-code&state=s3cret-state#frag';

it('logs an OAuth callback by its path, never its code or state', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const fetch = withRequestLog(async () => new Response(null, { status: 302 }));
  const response = await fetch(new Request(callback), {});
  expect(response.status).toBe(302);
  expect(log.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
    {
      method: 'GET',
      host: 'app.citeladder.com',
      path: '/api/v1/integrations/oauth/callback',
      status: 302,
    },
  ]);
});

it('logs a failed request by its path and error name, then rethrows', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetch = withRequestLog(async () => {
    throw new TypeError(`upstream refused ${callback}`);
  });
  await expect(fetch(new Request(callback), {})).rejects.toThrow('upstream refused');
  expect(error.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
    {
      method: 'GET',
      host: 'app.citeladder.com',
      path: '/api/v1/integrations/oauth/callback',
      error: 'TypeError',
    },
  ]);
});
