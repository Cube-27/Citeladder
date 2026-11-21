import { policy } from '../config.ts';

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

export class CorruptGrant extends Error {}

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

export function expiryMs(grant: GrantRow, subscriptionEnd: Date | null): number | null {
  const own = grant.valid_until?.getTime() ?? null;
  if (!PAID_ACCESS.has(grant.source_kind)) return own;
  if (subscriptionEnd === null) return Number.NEGATIVE_INFINITY;
  return own === null ? subscriptionEnd.getTime() : Math.min(own, subscriptionEnd.getTime());
}

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

function combine(type: string, prior: number, value: number): number {
  if (type === 'flag') return prior === 1 || value === 1 ? 1 : 0;
  if (type === 'level') return Math.max(prior, value);
  return prior + value;
}

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
