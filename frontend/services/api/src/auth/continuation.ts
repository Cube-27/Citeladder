import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { z } from 'zod';
import { safeAuthReturnPath } from '@citeladder/contracts/auth-continuation';
import { policy, type ServiceConfig } from '../config.ts';

const key = (config: ServiceConfig) =>
  createHash('sha256').update(`auth-continuation:${config.session.secretKey}`).digest();
const linkProofSchema = z.object({ userId: z.string(), version: z.int() });
export type LinkProof = z.infer<typeof linkProofSchema>;

export function sealContinuation(
  config: ServiceConfig,
  nonce: string,
  returnTo: string | undefined,
  proof?: LinkProof,
) {
  return new EncryptJWT({
    nonce,
    return_to: safeAuthReturnPath(returnTo) ?? '',
    ...(proof ? { proof } : {}),
  })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setExpirationTime(
      Math.floor(Date.now() / 1000) + Number(config.auth.oauthSettings.state_ttl_seconds),
    )
    .encrypt(key(config));
}

export async function openContinuation(
  config: ServiceConfig,
  nonce: string,
  sealed: string | undefined,
) {
  if (!sealed) return undefined;
  try {
    const { payload } = await jwtDecrypt(sealed, key(config), {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
      requiredClaims: ['exp'],
    });
    if (payload.nonce !== nonce) return undefined;
    const proof = linkProofSchema.safeParse(payload.proof);
    return {
      returnTo: safeAuthReturnPath(
        typeof payload.return_to === 'string' ? payload.return_to : undefined,
      ),
      proof: proof.success ? proof.data : undefined,
    };
  } catch {
    return undefined;
  }
}

export const continuationCookie = `${policy.auth.oauth.cookie_name}_continuation`;
