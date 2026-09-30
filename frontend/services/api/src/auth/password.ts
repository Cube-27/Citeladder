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
