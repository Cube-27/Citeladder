import { describe, expect, it } from 'vite-plus/test';
import { safeAuthReturnPath, withAuthReturnPath } from './auth-return-path';

describe('auth continuation', () => {
  it.each(['/mcp/oauth/consent?transaction=abc123', '/invitations/accept?token=abc_123'])(
    'round trips %s through signup and login',
    (path) => {
      const signup = new URL(withAuthReturnPath('/register', path), 'https://citeladder.invalid');
      const login = new URL(
        withAuthReturnPath(
          '/login?registered=1',
          safeAuthReturnPath(signup.searchParams.get('return_to')),
        ),
        signup,
      );
      expect(safeAuthReturnPath(login.searchParams.get('return_to'))).toBe(path);
    },
  );
  it.each([
    null,
    '/projects',
    '//evil.test/invitations/accept?token=abc',
    'https://evil.test/mcp/oauth/consent?transaction=abc',
    '/mcp/oauth/consent?transaction=abc&next=/admin',
    '/invitations/accept?token=abc&token=def',
    '/invitations/accept?token=abc#bad',
    '/invitations/accept?token=%2F%2Fevil.test',
    '/mcp/oauth/consent?transaction=',
    `/mcp/oauth/consent?transaction=${'a'.repeat(257)}`,
  ])('rejects %s', (value) => {
    expect(safeAuthReturnPath(value)).toBeUndefined();
  });
});
