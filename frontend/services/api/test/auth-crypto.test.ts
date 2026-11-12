import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { clientIdentity, clientNetwork, parseTrustedProxies } from '../src/auth/client-identity.ts';

describe('persisted authentication crypto', () => {
  it('verifies a hash stored under earlier Argon2 parameters after the cost change', async () => {
    const password = 'unicode-password-δ🔒';
    const storedHash =
      '$argon2id$v=19$m=65536,t=3,p=4$vV2ls3S+l2VxhYw633OYVw$GSAcbcffuYmEAcH9QdunQ4Md+ChceiwTv7ugkP9DU4g';
    expect(await verifyPassword(password, storedHash)).toBe(true);
    expect(await verifyPassword('incorrect', storedHash)).toBe(false);
    expect(await verifyPassword(password, await hashPassword(password))).toBe(true);
  });
  it('refuses malformed and absent password hashes', async () => {
    expect(await verifyPassword('password123', null)).toBe(false);
    expect(await verifyPassword('password123', '$argon2id$invalid')).toBe(false);
  });
  it('accepts a forwarding chain only from a trusted peer and stops at its first untrusted hop', () => {
    expect(clientIdentity('203.0.113.9', '198.51.100.1', parseTrustedProxies('127.0.0.0/8'))).toBe(
      '203.0.113.9',
    );
    expect(
      clientIdentity(
        '127.0.0.1',
        '198.51.100.1, 10.0.0.2',
        parseTrustedProxies('127.0.0.0/8,10.0.0.0/8'),
      ),
    ).toBe('198.51.100.1');
    expect(
      clientIdentity('127.0.0.1', '198.51.100.1, invalid', parseTrustedProxies('127.0.0.0/8')),
    ).toBe('127.0.0.1');
    expect(
      clientIdentity('::ffff:127.0.0.1', '2001:db8::1', parseTrustedProxies('127.0.0.0/8')),
    ).toBe('2001:db8::1');
  });
  it('counts an IPv6 visitor by its /64, a registration by its /56, and IPv4 by its address', () => {
    const networks = (scope: 'client' | 'registration', addresses: string[]) =>
      addresses.map((address) => clientNetwork(address, scope));
    expect(
      networks('client', [
        '2001:db8:1:2:aaaa:bbbb:cccc:dddd',
        '2001:DB8:1:2::9',
        '2001:db8:1:3::9',
        '203.0.113.9',
        '::ffff:203.0.113.9',
        'unavailable',
      ]),
    ).toEqual([
      '2001:db8:1:2::/64',
      '2001:db8:1:2::/64',
      '2001:db8:1:3::/64',
      '203.0.113.9',
      '203.0.113.9',
      'unavailable',
    ]);
    expect(
      networks('registration', ['2001:db8:1:2::9', '2001:db8:1:ff::9', '2001:db8:1:100::9']),
    ).toEqual(['2001:db8:1::/56', '2001:db8:1::/56', '2001:db8:1:100::/56']);
  });
});
