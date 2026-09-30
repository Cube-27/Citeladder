import { hash, verify } from '@node-rs/argon2';
import { policy } from '../config.ts';

export function hashPassword(password: string): Promise<string> {
  return hash(password, policy.auth.password);
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!encoded?.startsWith('$argon2')) return false;
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verify, paying one Argon2 verification even without a usable account, so
 * login latency does not reveal whether an address is registered.
 */
export async function verifyAccountPassword(
  password: string,
  encoded: string | null | undefined,
): Promise<boolean> {
  if (encoded?.startsWith('$argon2')) return verifyPassword(password, encoded);
  dummyHash ??= hashPassword('citeladder-timing-equalizer');
  await verifyPassword(password, await dummyHash);
  return false;
}
