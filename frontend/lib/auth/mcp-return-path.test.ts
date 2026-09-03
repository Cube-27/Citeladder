import { describe, expect, it } from 'vitest';

import { safeMcpReturnPath, withMcpReturnPath } from './mcp-return-path';

/**
 * `return_to` arrives from the URL, so these cases are the open-redirect
 * boundary: anything that is not the one consent path we resume must answer
 * `undefined` and fall back to normal post-auth routing.
 */
describe('safeMcpReturnPath', () => {
  it('accepts the consent path and rebuilds it from its parsed parts', () => {
    expect(safeMcpReturnPath('/mcp/oauth/consent?transaction=abc123')).toBe(
      '/mcp/oauth/consent?transaction=abc123',
    );
  });

  it('drops every parameter except the transaction', () => {
    expect(safeMcpReturnPath('/mcp/oauth/consent?transaction=abc&next=/admin')).toBe(
      '/mcp/oauth/consent?transaction=abc',
    );
  });

  it.each([
    ['no value', null],
    ['an unrelated internal path', '/projects'],
    ['an absolute external URL', 'https://evil.test/mcp/oauth/consent?transaction=abc'],
    ['a protocol-relative URL', '//evil.test/mcp/oauth/consent?transaction=abc'],
    ['a fragment', '/mcp/oauth/consent?transaction=abc#/evil'],
    ['a missing transaction', '/mcp/oauth/consent?state=abc'],
    ['an empty transaction', '/mcp/oauth/consent?transaction='],
    ['an over-long transaction', `/mcp/oauth/consent?transaction=${'a'.repeat(257)}`],
    ['a path that only looks like the consent route', '/mcp/oauth/consent-evil?transaction=abc'],
  ])('rejects %s', (_label, value) => {
    expect(safeMcpReturnPath(value)).toBeUndefined();
  });
});

describe('withMcpReturnPath', () => {
  it('returns the destination unchanged when there is nothing to carry', () => {
    expect(withMcpReturnPath('/register', undefined)).toBe('/register');
  });

  it('appends with ? when the destination has no query', () => {
    expect(withMcpReturnPath('/register', '/mcp/oauth/consent?transaction=abc')).toBe(
      '/register?return_to=%2Fmcp%2Foauth%2Fconsent%3Ftransaction%3Dabc',
    );
  });

  it('appends with & when the destination already has a query', () => {
    expect(withMcpReturnPath('/login?registered=1', '/mcp/oauth/consent?transaction=abc')).toBe(
      '/login?registered=1&return_to=%2Fmcp%2Foauth%2Fconsent%3Ftransaction%3Dabc',
    );
  });

  it('round-trips back through the validator', () => {
    const original = '/mcp/oauth/consent?transaction=abc123';
    const url = new URL(withMcpReturnPath('/register', original), 'https://citeladder.invalid');
    expect(safeMcpReturnPath(url.searchParams.get('return_to'))).toBe(original);
  });
});
