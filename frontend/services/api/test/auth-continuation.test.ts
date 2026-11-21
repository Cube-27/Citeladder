import { createHash } from 'node:crypto';
import { EncryptJWT } from 'jose';
import { describe, expect, it } from 'vite-plus/test';
import { openContinuation, sealContinuation } from '../src/auth/continuation.ts';
import type { ServiceConfig } from '../src/config.ts';

const RETURN_TO = '/invitations/accept?token=t1';
const secretKey = 'test-only-continuation-secret';
const config = {
  session: { secretKey },
  auth: { oauthSettings: { state_ttl_seconds: 600 } },
} as unknown as ServiceConfig;

const sealedWithProof = (proof: unknown) =>
  new EncryptJWT({ nonce: 'n', return_to: RETURN_TO, proof })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .encrypt(createHash('sha256').update(`auth-continuation:${secretKey}`).digest());

describe('openContinuation', () => {
  it('returns a sealed link proof and drops a malformed one', async () => {
    const sealed = await sealContinuation(config, 'n', RETURN_TO, { userId: 'u1', version: 3 });
    expect(await openContinuation(config, 'n', sealed)).toEqual({
      returnTo: RETURN_TO,
      proof: { userId: 'u1', version: 3 },
    });
    for (const proof of [{ userId: 'u1', version: 1.5 }, { userId: 7, version: 1 }, 'u1']) {
      expect(await openContinuation(config, 'n', await sealedWithProof(proof))).toEqual({
        returnTo: RETURN_TO,
        proof: undefined,
      });
    }
  });
});
