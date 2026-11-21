import { createIdempotencyKey } from '@/lib/api/billing';

const bucket = (userId: string, workspaceId: string | null) =>
  `billing-checkout:${userId}:${workspaceId ?? 'default'}`;

export function checkoutAttempt(
  userId: string,
  workspaceId: string | null,
  input: object,
  proposed?: string,
): string {
  const fingerprint = JSON.stringify(input);
  const storageKey = bucket(userId, workspaceId);
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (
      raw &&
      typeof raw === 'object' &&
      'fingerprint' in raw &&
      raw.fingerprint === fingerprint &&
      'key' in raw &&
      typeof raw.key === 'string'
    )
      return raw.key;
  } catch {}
  const key = proposed ?? createIdempotencyKey();
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
  } catch {}
  return key;
}

export function clearCheckoutAttempt(userId: string, workspaceId: string | null): void {
  try {
    sessionStorage.removeItem(bucket(userId, workspaceId));
  } catch {}
}
