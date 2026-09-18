// @vitest-environment node
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { onRequest } from './middleware';

afterEach(() => vi.unstubAllEnvs());

describe('marketing backend proxy', () => {
  it('returns OAuth redirects and cookies without following them', async () => {
    const requests: string[] = [];
    const backend = createServer((request, response) => {
      requests.push(request.url ?? '');
      if (request.url === '/api/v1/auth/start?provider=google') {
        // Mirrors the real backend's cookie policy (see
        // backend/app/api/browser_cookies.py): Secure is set outside local
        // dev, so the fixture carries it too.
        response.writeHead(302, {
          Location: '/identity-provider',
          'Set-Cookie': 'oauth_state=opaque; HttpOnly; Secure; SameSite=Lax; Path=/',
        });
      }
      response.end();
    });
    backend.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('BACKEND_ORIGIN', `http://127.0.0.1:${(backend.address() as AddressInfo).port}`);

    try {
      const request = new Request('http://marketing.test/api/v1/auth/start?provider=google');
      const next = vi.fn(async () => new Response('marketing page'));
      const response = await onRequest(
        { request, url: new URL(request.url) } as Parameters<typeof onRequest>[0],
        next,
      );

      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(302);
      expect(response?.headers.get('location')).toBe('/identity-provider');
      expect(response?.headers.get('set-cookie')).toBe(
        'oauth_state=opaque; HttpOnly; Secure; SameSite=Lax; Path=/',
      );
      expect(requests).toEqual(['/api/v1/auth/start?provider=google']);
      expect(next).not.toHaveBeenCalled();
      await response?.body?.cancel();
    } finally {
      backend.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        backend.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
