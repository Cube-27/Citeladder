import { createIdempotencyKey, type SubscriptionCheckoutInput } from '@/lib/api/billing';

/** An account-bound retry breadcrumb. Never carries a price or provider credential. */
export function checkoutAttempt(
  userId: string,
  input: SubscriptionCheckoutInput,
  proposed?: string,
): string {
  const fingerprint = JSON.stringify(input);
  const storageKey = `billing-checkout:${userId}`;
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

export function clearCheckoutAttempt(userId: string): void {
  try {
    sessionStorage.removeItem(`billing-checkout:${userId}`);
  } catch {
    /* Storage is optional; server authorization remains authoritative. */
  }
}
