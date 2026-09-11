import { createIdempotencyKey, type SubscriptionCheckoutInput } from '@/lib/api/billing';

/**
 * A workspace-bound retry breadcrumb. Never carries a price or a credential.
 *
 * The workspace is part of the identity because the purchase is: the same
 * person buying the same plan for two workspaces is two purchases, and
 * reusing one idempotency key across them would replay the first workspace's
 * activation into the second.
 */
export function checkoutAttempt(
  userId: string,
  workspaceId: string,
  input: SubscriptionCheckoutInput,
  proposed?: string,
): string {
  const fingerprint = JSON.stringify(input);
  const storageKey = `billing-checkout:${userId}:${workspaceId}`;
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
  } catch {
    /* Missing or unavailable storage leaves server idempotency authoritative. */
  }
  const key = proposed ?? createIdempotencyKey();
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
  } catch {
    /* The controller retains the key in memory when storage is unavailable. */
  }
  return key;
}

export function clearCheckoutAttempt(userId: string, workspaceId: string): void {
  try {
    sessionStorage.removeItem(`billing-checkout:${userId}:${workspaceId}`);
  } catch {
    /* Storage is optional; server authorization remains authoritative. */
  }
}
