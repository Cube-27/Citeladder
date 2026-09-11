import { createIdempotencyKey, type SubscriptionCheckoutInput } from '@/lib/api/billing';

/**
 * The storage bucket for one (buyer, workspace) pair.
 *
 * `null` is the public pricing page, which names no workspace and lets the
 * server resolve the buyer's default one. It gets its own bucket rather than
 * borrowing a selected workspace's: the client cannot tell which workspace
 * the server will pick, so it must not claim a key minted for a named one.
 */
const bucket = (userId: string, workspaceId: string | null) =>
  `billing-checkout:${userId}:${workspaceId ?? 'default'}`;

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
  workspaceId: string | null,
  input: SubscriptionCheckoutInput,
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

export function clearCheckoutAttempt(userId: string, workspaceId: string | null): void {
  try {
    sessionStorage.removeItem(bucket(userId, workspaceId));
  } catch {
    /* Storage is optional; server authorization remains authoritative. */
  }
}
