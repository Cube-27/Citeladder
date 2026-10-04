import { randomUUID } from 'node:crypto';
import { jwtVerify } from 'jose';
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { issueSession } from '../src/auth/service.ts';
import { clientIdentity, parseTrustedProxies } from '../src/auth/client-identity.ts';
import { testConfig } from './support.ts';

describe('persisted authentication crypto', () => {
  const config = testConfig();
  it('reads a recorded Python Argon2 hash and HS256 token and preserves native session claims', async () => {
    const password = 'unicode-password-δ🔒';
    const storedHash =
      '$argon2id$v=19$m=65536,t=3,p=4$vV2ls3S+l2VxhYw633OYVw$GSAcbcffuYmEAcH9QdunQ4Md+ChceiwTv7ugkP9DU4g';
    expect(await verifyPassword(password, storedHash)).toBe(true);
    expect(await verifyPassword('incorrect', storedHash)).toBe(false);
    expect(
      (
        await jwtVerify(
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJ2ZXIiOjIsImV4cCI6NDEwMjQ0NDgwMH0.ul_MFGJuwHJsZ_sKr1GZSYUO4Q5WbmNMsM7SMe9cIKo',
          new TextEncoder().encode(config.session.secretKey),
        )
      ).payload,
    ).toMatchObject({ sub: '11111111-1111-4111-8111-111111111111', ver: 2 });
    const id = randomUUID();
    const token = await issueSession(config, {
      id,
      session_version: 2,
      email: 'interop@example.test',
      role: 'user',
      is_active: true,
      hashed_password: await hashPassword(password),
      created_at: new Date(),
      updated_at: new Date(),
    });
    expect(
      (await jwtVerify(token, new TextEncoder().encode(config.session.secretKey))).payload,
    ).toMatchObject({ sub: id, ver: 2 });
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
});
