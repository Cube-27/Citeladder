/**
 * Entitlement resolution: fold one billing account's grants into capability
 * values at an instant.
 *
 * Python billing writes grants, revocations and subscriptions; this reads
 * them in the caller's transaction on every call (no cache, since
 * authorization must see the rows that transaction sees). One corrupt grant
 * makes the whole account unresolved, which callers treat as a denial.
 *
 * Selection: exactly one primary bundle (highest `profile_priority`, then
 * `bundle_id`) plus every supplement. Flags OR, levels take the maximum, and
 * counters add. Add-ons and top-ups count only while the current base
 * subscription has a readable period end, and never past it.
 */
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';

export type GrantRow = {
  id: string;
  key: string;
  value: number;
  source_kind: string;
  valid_from: Date;
  valid_until: Date | null;
  bundle_role: string;
  bundle_id: string;
  profile_priority: number;
};

export type RevocationRow = { grant_id: string; effective_from: Date };

export type Entitlement =
  | { status: 'resolved'; values: ReadonlyMap<string, number> }
  | { status: 'unresolved'; error: string };

const CAPABILITIES: Record<string, { type: string; levels: number }> =
  policy.entitlements.capabilities;
const SOURCE_KINDS = new Set(policy.entitlements.grant_source_kinds);
const PAID_ACCESS = new Set(policy.entitlements.paid_access_sources);
const PRIMARY = 'primary';
const SUPPLEMENT = 'supplement';

class CorruptGrant extends Error {}

/** Flags are 0 or 1, levels an ordinal of the definition, counters non-negative. */
function valueFits(definition: { type: string; levels: number }, value: number): boolean {
  if (definition.type === 'flag') return value === 0 || value === 1;
  if (definition.type === 'level') return value >= 0 && value < definition.levels;
  return value >= 0;
}

function validate(grant: GrantRow): void {
  const definition = Object.hasOwn(CAPABILITIES, grant.key) ? CAPABILITIES[grant.key] : undefined;
  if (definition === undefined) throw new CorruptGrant(`unknown capability key: ${grant.key}`);
  if (!SOURCE_KINDS.has(grant.source_kind))
    throw new CorruptGrant(`unknown grant source kind: ${grant.source_kind}`);
  if (!valueFits(definition, grant.value)) {
    throw new CorruptGrant(`grant value out of range: ${grant.key}`);
  }
  if (grant.bundle_role !== PRIMARY && grant.bundle_role !== SUPPLEMENT)
    throw new CorruptGrant(`unknown grant bundle role: ${grant.bundle_role}`);
  if (grant.bundle_role === PRIMARY && !grant.bundle_id)
    throw new CorruptGrant('primary grant is missing bundle identity');
}

/** When a grant stops counting; `null` never expires, `-Infinity` never started. */
function expiryMs(grant: GrantRow, subscriptionEnd: Date | null): number | null {
  const own = grant.valid_until?.getTime() ?? null;
  if (!PAID_ACCESS.has(grant.source_kind)) return own;
  if (subscriptionEnd === null) return Number.NEGATIVE_INFINITY;
  return own === null ? subscriptionEnd.getTime() : Math.min(own, subscriptionEnd.getTime());
}

/** Capability values at `at`; throws `CorruptGrant` on any invalid row. */
export function foldEntitlement(
  grants: readonly GrantRow[],
  revocations: readonly RevocationRow[],
  subscriptionEnd: Date | null,
  at: Date,
): Map<string, number> {
  grants.forEach(validate);
  const now = at.getTime();
  const revokedAt = new Map<string, number>();
  for (const { grant_id: id, effective_from: from } of revocations) {
    revokedAt.set(id, Math.min(revokedAt.get(id) ?? Infinity, from.getTime()));
  }
  const active = grants.filter((grant) => {
    if (grant.valid_from.getTime() > now) return false;
    if ((revokedAt.get(grant.id) ?? Infinity) <= now) return false;
    const expiry = expiryMs(grant, subscriptionEnd);
    return expiry === null || now < expiry;
  });
  let bundle: { priority: number; id: string } | null = null;
  for (const grant of active) {
    if (grant.bundle_role !== PRIMARY) continue;
    const better =
      bundle === null ||
      grant.profile_priority > bundle.priority ||
      (grant.profile_priority === bundle.priority && grant.bundle_id > bundle.id);
    if (better) bundle = { priority: grant.profile_priority, id: grant.bundle_id };
  }
  const values = new Map<string, number>();
  for (const grant of active) {
    if (grant.bundle_role === PRIMARY && grant.bundle_id !== bundle?.id) continue;
    const type = CAPABILITIES[grant.key]!.type;
    const prior = values.get(grant.key);
    if (prior === undefined) values.set(grant.key, grant.value);
    else if (type === 'flag') values.set(grant.key, prior === 1 || grant.value === 1 ? 1 : 0);
    else if (type === 'level') values.set(grant.key, Math.max(prior, grant.value));
    else values.set(grant.key, prior + grant.value);
  }
  return values;
}

/** Resolve one account in the caller's transaction. */
export async function resolveAccountEntitlement(
  db: Database,
  accountId: string,
  at: Date,
): Promise<Entitlement> {
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('id', '=', accountId)
    .executeTakeFirst();
  if (account === undefined) return { status: 'unresolved', error: 'billing_account_missing' };
  const [grants, revocations, subscription] = await Promise.all([
    db
      .selectFrom('account_grants')
      .select([
        'id',
        'key',
        'value',
        'source_kind',
        'valid_from',
        'valid_until',
        'bundle_role',
        'bundle_id',
        'profile_priority',
      ])
      .where('billing_account_id', '=', accountId)
      .execute(),
    db
      .selectFrom('grant_revocations')
      .innerJoin('account_grants', 'account_grants.id', 'grant_revocations.grant_id')
      .select(['grant_revocations.grant_id', 'grant_revocations.effective_from'])
      .where('account_grants.billing_account_id', '=', accountId)
      .execute(),
    db
      .selectFrom('billing_subscriptions')
      .select('current_period_end')
      .where('billing_account_id', '=', accountId)
      .where('is_current', '=', true)
      .where('subscription_kind', '=', policy.entitlements.base_subscription_kind)
      .executeTakeFirst(),
  ]);
  try {
    const values = foldEntitlement(
      grants,
      revocations,
      subscription?.current_period_end ?? null,
      at,
    );
    return { status: 'resolved', values };
  } catch (error) {
    if (error instanceof CorruptGrant) return { status: 'unresolved', error: error.message };
    throw error;
  }
}
