import { describe, expect, it, vi } from 'vite-plus/test';

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
      expect(request.headers.get('x-citeladder-origin-token')).toBe(config.originToken);
      expect(request.headers.get('x-citeladder-public-host')).toBe(config.publicHost);
      expect(request.headers.get('x-forwarded-host')).toBeNull();
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
});
