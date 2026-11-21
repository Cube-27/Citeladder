import { describe, expect, it, vi } from 'vite-plus/test';

import { signOriginRequest } from '@citeladder/contracts/origin-signature';

import { proxyWorkerRequest } from './worker-origin-proxy';

const config = {
  upstream: 'https://origin.citeladder.com',
  publicHost: 'app.citeladder.com',
  originToken: 'dedicated-secret-at-least-thirty-two-characters',
};

describe('Worker origin transport', () => {
  it('fixes the upstream and strips spoofed forwarding credentials', async () => {
    const transport = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://origin.citeladder.com/api/v1/items?next=%2F');
      expect(request.headers.get('x-citeladder-origin-token')).toBeNull();
      const timestamp = Number(request.headers.get('x-citeladder-origin-timestamp'));
      expect(Math.abs(timestamp - Date.now() / 1000)).toBeLessThan(5);
      expect(request.headers.get('x-citeladder-origin-signature')).toBe(
        await signOriginRequest(config.originToken, {
          timestamp,
          method: 'GET',
          publicHost: 'app.citeladder.com',
          target: '/api/v1/items?next=%2F',
          clientIp: '203.0.113.7',
        }),
      );
      expect(request.headers.get('x-citeladder-public-host')).toBe(config.publicHost);
      expect(request.headers.get('x-forwarded-host')).toBeNull();
      expect(request.headers.get('x-citeladder-client-ip')).toBe('203.0.113.7');
      expect(request.headers.get('origin')).toBe('https://app.citeladder.com');
      const headers = new Headers();
      headers.append('Set-Cookie', 'first=1; HttpOnly');
      headers.append('Set-Cookie', 'second=2; HttpOnly');
      headers.set('Location', '/login');
      return new Response(null, { status: 302, headers });
    });
    const request = new Request('https://app.citeladder.com/api/v1/items?next=%2F', {
      headers: {
        Origin: 'https://app.citeladder.com',
        'X-Forwarded-Host': 'attacker.example',
        'X-CiteLadder-Origin-Token': 'spoof',
        'X-CiteLadder-Origin-Signature': 'spoof',
        'X-CiteLadder-Origin-Timestamp': '1',
        'X-CiteLadder-Client-IP': '198.51.100.1',
        'CF-Connecting-IP': '203.0.113.7',
      },
    });
    const response = await proxyWorkerRequest(request, config, transport);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/login');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(transport).toHaveBeenCalledOnce();
  });

  it('rejects a public-host mismatch before sending an upstream request', async () => {
    const transport = vi.fn();
    const response = await proxyWorkerRequest(
      new Request('https://attacker.example/api/v1/items'),
      config,
      transport,
    );
    expect(response.status).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  });

  it('accepts a local HTTPS port while forwarding the configured public hostname', async () => {
    const transport = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-citeladder-public-host')).toBe(config.publicHost);
      return new Response('ok');
    });
    const response = await proxyWorkerRequest(
      new Request('https://app.citeladder.com:8787/api/v1/items'),
      config,
      transport,
    );
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalledOnce();
  });

  it("keeps the origin's revalidated policy and validator, and stores nothing else", async () => {
    const tag = 'W/"snapshot-tag"';
    const policies: Record<string, string> = {
      overview: 'private, no-cache',
      cached: 'private, max-age=86400',
      other: 'no-store',
    };
    const transport = vi.fn(async (request: Request) =>
      request.headers.get('if-none-match') === tag
        ? new Response(null, {
            status: 304,
            headers: { etag: tag, 'cache-control': 'private, no-cache' },
          })
        : new Response('{}', {
            headers: {
              etag: tag,
              'cache-control': policies[new URL(request.url).pathname.split('/').at(-1)!]!,
            },
          }),
    );
    const send = (path: string, headers: Record<string, string> = {}) =>
      proxyWorkerRequest(
        new Request(`https://app.citeladder.com${path}`, { headers }),
        config,
        transport,
      );

    const snapshot = await send('/api/v1/overview');
    expect([snapshot.headers.get('cache-control'), snapshot.headers.get('etag')]).toEqual([
      'private, no-cache',
      tag,
    ]);
    const revalidated = await send('/api/v1/overview', { 'If-None-Match': tag });
    expect([revalidated.status, await revalidated.text()]).toEqual([304, '']);
    for (const path of ['/api/v1/cached', '/api/v1/other'])
      expect((await send(path)).headers.get('cache-control')).toBe('private, no-store');
  });
});
