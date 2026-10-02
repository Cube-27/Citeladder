import { describe, expect, it } from 'vite-plus/test';

import { resolveApiServiceOrigin } from './api-service-origin';

describe('resolveApiServiceOrigin', () => {
  it('rejects a trailing-dot loopback hostname in production', () => {
    expect(() => resolveApiServiceOrigin('http://localhost.:8100', true)).toThrow(/loopback host/i);
  });

  it('rejects a bracketed IPv6 loopback in production', () => {
    expect(() => resolveApiServiceOrigin('http://[::1]:8100', true)).toThrow(/loopback host/i);
  });

  // `URL` normalizes every one of these to `[::ffff:7f00:1]`, which is neither
  // `::1` nor prefixed `127.` — the gap this suite exists to pin.
  it.each([
    'http://[::ffff:127.0.0.1]:8100',
    'http://[::ffff:7f00:1]:8100',
    'http://[0:0:0:0:0:ffff:127.0.0.1]:8100',
    // Non-loopback mapped literals are rejected too: conservative by design.
    'http://[::ffff:192.168.1.1]:8100',
  ])('rejects the IPv4-mapped IPv6 literal %s in production', (origin) => {
    expect(() => resolveApiServiceOrigin(origin, true)).toThrow(/loopback host/i);
  });

  it('rejects the unspecified addresses in production', () => {
    expect(() => resolveApiServiceOrigin('http://0.0.0.0:8100', true)).toThrow(/loopback host/i);
    expect(() => resolveApiServiceOrigin('http://[::]:8100', true)).toThrow(/loopback host/i);
  });

  it('continues to allow a non-loopback production origin', () => {
    expect(resolveApiServiceOrigin('https://backend.internal.example', true)).toBe(
      'https://backend.internal.example',
    );
  });

  it('allows a real IPv6 origin that is not loopback or mapped', () => {
    expect(resolveApiServiceOrigin('http://[2606:4700:4700::1111]', true)).toBe(
      'http://[2606:4700:4700::1111]',
    );
  });

  it('still permits loopback outside production', () => {
    expect(resolveApiServiceOrigin('http://127.0.0.1:8100', false)).toBe('http://127.0.0.1:8100');
  });

  it('permits only the exact task-local backend when explicitly enabled', () => {
    expect(resolveApiServiceOrigin('http://127.0.0.1:8100', true, true)).toBe(
      'http://127.0.0.1:8100',
    );
    expect(() => resolveApiServiceOrigin('http://127.0.0.1:9000', true, true)).toThrow(
      /loopback host/i,
    );
    expect(() => resolveApiServiceOrigin('http://localhost:8100', true, true)).toThrow(
      /loopback host/i,
    );
  });
});
