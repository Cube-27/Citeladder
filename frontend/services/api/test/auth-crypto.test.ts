import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { jwtVerify } from 'jose';
import { beforeAll, describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { issueSession } from '../src/auth/service.ts';
import { clientIdentity, parseTrustedProxies } from '../src/auth/client-identity.ts';
import { testConfig } from './support.ts';

const backend = fileURLToPath(new URL('../../../../backend/', import.meta.url));
const python = fileURLToPath(
  new URL(
    process.platform === 'win32'
      ? '../../../../backend/.venv/Scripts/python.exe'
      : '../../../../backend/.venv/bin/python',
    import.meta.url,
  ),
);
function interop(input: object): {
  token: string;
  hash: string;
  verified: boolean;
  claims: { sub: string; ver: number };
} {
  return JSON.parse(
    execFileSync(python, [fileURLToPath(new URL('./auth-interop.py', import.meta.url))], {
      cwd: backend,
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        PYTHONPATH: backend,
        PYTHONUTF8: '1',
        DATABASE_URL: 'postgresql+asyncpg://postgres:test@localhost/test',
        CITELADDER_DISABLE_DOTENV: '1',
      },
    }),
  );
}

describe('cross-stack authentication crypto', () => {
  const id = randomUUID();
  const password = 'unicode-password-δ🔒';
  const config = testConfig();
  let issued: ReturnType<typeof interop>;
  let result: ReturnType<typeof interop>;
  // Provision live crypto inputs in the suite setup; Windows process startup
  // belongs to fixture setup rather than the assertion path's 5-second budget.
  beforeAll(async () => {
    issued = interop({ operation: 'issue', user_id: id, password });
    const token = await issueSession(config, {
      id,
      session_version: 2,
      email: 'interop@example.test',
      role: 'user',
      is_active: true,
      hashed_password: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    result = interop({ operation: 'verify', token, hash: await hashPassword(password), password });
  });
  it('verifies each stack’s Argon2 hashes and signed session claims in the other stack', async () => {
    expect(await verifyPassword(password, issued.hash)).toBe(true);
    expect(await verifyPassword('incorrect', issued.hash)).toBe(false);
    const pythonClaims = await jwtVerify(
      issued.token,
      new TextEncoder().encode(config.session.secretKey),
    );
    expect(pythonClaims.payload).toMatchObject({ sub: id, ver: 2 });
    expect(result.verified).toBe(true);
    expect(result.claims).toMatchObject({ sub: id, ver: 2 });
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
