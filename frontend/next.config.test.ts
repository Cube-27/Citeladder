import { describe, expect, it } from 'vitest';

import { resolveBackendOrigin } from './next.config';

describe('resolveBackendOrigin', () => {
  it('rejects a trailing-dot loopback hostname in production', () => {
    expect(() => resolveBackendOrigin('http://localhost.:8000', true)).toThrow(/loopback host/i);
  });

  it('continues to allow a non-loopback production origin', () => {
    expect(resolveBackendOrigin('https://backend.internal.example', true)).toBe(
      'https://backend.internal.example',
    );
  });
});
