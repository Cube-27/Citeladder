import { describe, expect, it } from 'vitest';

import { resolveBackendOrigin } from './next.config';

describe('resolveBackendOrigin', () => {
  it('rejects a trailing-dot loopback hostname in production', () => {
    expect(() => resolveBackendOrigin('http://localhost.:8000', true)).toThrow(/loopback host/i);
  });

  it('rejects a bracketed IPv6 loopback in production', () => {
    expect(() => resolveBackendOrigin('http://[::1]:8000', true)).toThrow(/loopback host/i);
  });

  // `URL` normalizes every one of these to `[::ffff:7f00:1]`, which is neither
  // `::1` nor prefixed `127.` — the gap this suite exists to pin.
  it.each([
    'http://[::ffff:127.0.0.1]:8000',
    'http://[::ffff:7f00:1]:8000',
    'http://[0:0:0:0:0:ffff:127.0.0.1]:8000',
    // Non-loopback mapped literals are rejected too: conservative by design.
    'http://[::ffff:192.168.1.1]:8000',
  ])('rejects the IPv4-mapped IPv6 literal %s in production', (origin) => {
    expect(() => resolveBackendOrigin(origin, true)).toThrow(/loopback host/i);
  });

  it('rejects the unspecified addresses in production', () => {
    expect(() => resolveBackendOrigin('http://0.0.0.0:8000', true)).toThrow(/loopback host/i);
    expect(() => resolveBackendOrigin('http://[::]:8000', true)).toThrow(/loopback host/i);
  });

  it('continues to allow a non-loopback production origin', () => {
    expect(resolveBackendOrigin('https://backend.internal.example', true)).toBe(
      'https://backend.internal.example',
    );
  });

  it('allows a real IPv6 origin that is not loopback or mapped', () => {
    expect(resolveBackendOrigin('http://[2606:4700:4700::1111]', true)).toBe(
      'http://[2606:4700:4700::1111]',
    );
  });

  it('still permits loopback outside production', () => {
    expect(resolveBackendOrigin('http://127.0.0.1:8000', false)).toBe('http://127.0.0.1:8000');
  });

  it('permits only the exact task-local backend when explicitly enabled', () => {
    expect(resolveBackendOrigin('http://127.0.0.1:8000', true, true)).toBe('http://127.0.0.1:8000');
    expect(() => resolveBackendOrigin('http://127.0.0.1:9000', true, true)).toThrow(
      /loopback host/i,
    );
    expect(() => resolveBackendOrigin('http://localhost:8000', true, true)).toThrow(
      /loopback host/i,
    );
  });
});
