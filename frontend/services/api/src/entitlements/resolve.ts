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
  | { status: 'resolved'; values: ReadonlyMap<string, number>; validUntil: Date | null }
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
export function expiryMs(grant: GrantRow, subscriptionEnd: Date | null): number | null {
  const own = grant.valid_until?.getTime() ?? null;
  if (!PAID_ACCESS.has(grant.source_kind)) return own;
  if (subscriptionEnd === null) return Number.NEGATIVE_INFINITY;
  return own === null ? subscriptionEnd.getTime() : Math.min(own, subscriptionEnd.getTime());
}

/** Each grant's earliest revocation instant. */
function revocationTimes(revocations: readonly RevocationRow[]): Map<string, number> {
  const revokedAt = new Map<string, number>();
  for (const { grant_id: id, effective_from: from } of revocations) {
    revokedAt.set(id, Math.min(revokedAt.get(id) ?? Infinity, from.getTime()));
  }
  return revokedAt;
}

function isActive(
  grant: GrantRow,
  revokedAt: ReadonlyMap<string, number>,
  subscriptionEnd: Date | null,
  now: number,
): boolean {
  if (grant.valid_from.getTime() > now) return false;
  if ((revokedAt.get(grant.id) ?? Infinity) <= now) return false;
  const expiry = expiryMs(grant, subscriptionEnd);
  return expiry === null || now < expiry;
}

/** The selected primary bundle: highest priority, then bundle id. */
function primaryBundle(active: readonly GrantRow[]): string | null {
  let best: { priority: number; id: string } | null = null;
  for (const grant of active) {
    if (grant.bundle_role !== PRIMARY) continue;
    const better =
      best === null ||
      grant.profile_priority > best.priority ||
      (grant.profile_priority === best.priority && grant.bundle_id > best.id);
    if (better) best = { priority: grant.profile_priority, id: grant.bundle_id };
  }
  return best?.id ?? null;
}

/** Flags OR, levels take the maximum, counters add. */
function combine(type: string, prior: number, value: number): number {
  if (type === 'flag') return prior === 1 || value === 1 ? 1 : 0;
  if (type === 'level') return Math.max(prior, value);
  return prior + value;
}

/** Earliest future change to the selected projection, including future grants. */
export function entitlementChangeAt(
  grants: readonly GrantRow[],
  revocations: readonly RevocationRow[],
  subscriptionEnd: Date | null,
  at: Date,
): Date | null {
  const selected = new Set(
    selectedGrants(grants, revocations, subscriptionEnd, at).map((grant) => grant.id),
  );
  const changes = grants.flatMap((grant) => [
    grant.valid_from.getTime(),
    ...(selected.has(grant.id) ? [expiryMs(grant, subscriptionEnd) ?? Infinity] : []),
  ]);
  changes.push(
    ...revocations
      .filter((row) => selected.has(row.grant_id))
      .map((row) => row.effective_from.getTime()),
    subscriptionEnd?.getTime() ?? Infinity,
  );
  const future = changes.filter((value) => Number.isFinite(value) && value > at.getTime());
  return future.length ? new Date(Math.min(...future)) : null;
}

/** Capability values at `at`; throws `CorruptGrant` on any invalid row. */
export function selectedGrants(
  grants: readonly GrantRow[],
  revocations: readonly RevocationRow[],
  subscriptionEnd: Date | null,
  at: Date,
): GrantRow[] {
  grants.forEach(validate);
  const revokedAt = revocationTimes(revocations);
  const active = grants.filter((grant) =>
    isActive(grant, revokedAt, subscriptionEnd, at.getTime()),
  );
  const bundle = primaryBundle(active);
  return active.filter((grant) => grant.bundle_role !== PRIMARY || grant.bundle_id === bundle);
}

export function foldEntitlement(
  grants: readonly GrantRow[],
  revocations: readonly RevocationRow[],
  subscriptionEnd: Date | null,
  at: Date,
): Map<string, number> {
  const values = new Map<string, number>();
  for (const grant of selectedGrants(grants, revocations, subscriptionEnd, at)) {
    const prior = values.get(grant.key);
    values.set(
      grant.key,
      prior === undefined
        ? grant.value
        : combine(CAPABILITIES[grant.key]!.type, prior, grant.value),
    );
  }
  return values;
}

/** Resolve the account that bills `workspaceId`, in the caller's transaction. */
export async function resolveAccountEntitlement(
  db: Database,
  { accountId, workspaceId }: { accountId: string; workspaceId: string },
  at: Date,
): Promise<Entitlement> {
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('id', '=', accountId)
    .where('workspace_id', '=', workspaceId)
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
    return {
      status: 'resolved',
      values,
      validUntil: entitlementChangeAt(
        grants,
        revocations,
        subscription?.current_period_end ?? null,
        at,
      ),
    };
  } catch (error) {
    if (error instanceof CorruptGrant) return { status: 'unresolved', error: error.message };
    throw error;
  }
}
