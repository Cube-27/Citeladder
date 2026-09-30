import type { Database } from '../db/database.ts';
import { policy } from '../config.ts';
import { expiryMs, selectedGrants, foldEntitlement, type GrantRow } from './resolve.ts';

/** One persisted projection reused by usage, reads and admission. Never provisions. */
export async function accountState(db: Database, workspaceId: string, accountId: string, at: Date) {
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
  const [grants, revocations, subscription] = await Promise.all([
    db
      .selectFrom('account_grants')
      .selectAll()
      .where('billing_account_id', '=', accountId)
      .orderBy('id')
      .execute(),
    db
      .selectFrom('grant_revocations')
      .innerJoin('account_grants', 'account_grants.id', 'grant_revocations.grant_id')
      .select(['grant_revocations.grant_id', 'grant_revocations.effective_from'])
      .where('account_grants.billing_account_id', '=', accountId)
      .execute(),
    db
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('billing_account_id', '=', accountId)
      .where('is_current', '=', true)
      .where('subscription_kind', '=', 'base')
      .executeTakeFirst(),
  ]);
  const end = subscription?.current_period_end ?? null;
  const revokedAt = new Map<string, Date>();
  for (const row of revocations) {
    const prior = revokedAt.get(row.grant_id);
    if (!prior || prior > row.effective_from) revokedAt.set(row.grant_id, row.effective_from);
  }
  let selected: GrantRow[] = [];
  let values = new Map<string, number>();
  let error: string | null = null;
  try {
    selected = selectedGrants(grants, revocations, end, at);
    values = foldEntitlement(grants, revocations, end, at);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'entitlement_unresolved';
  }
  const changes = grants.flatMap((grant) => [
    grant.valid_from.getTime(),
    expiryMs(grant, end) ?? Infinity,
  ]);
  changes.push(
    ...revocations.map((row) => row.effective_from.getTime()),
    end?.getTime() ?? Infinity,
  );
  const future = changes.filter((time) => Number.isFinite(time) && time > at.getTime());
  const validUntil = future.length ? new Date(Math.min(...future)) : null;
  return {
    account,
    grants,
    revocations,
    revokedAt,
    subscription: subscription ?? null,
    selected,
    values,
    error,
    validUntil,
    end,
  };
}

export function drawOrder(grants: readonly GrantRow[], end: Date | null): GrantRow[] {
  return [...grants].sort(
    (a, b) =>
      (expiryMs(a, end) ?? Infinity) - (expiryMs(b, end) ?? Infinity) ||
      policy.entitlements.draw_source_order.indexOf(a.source_kind) -
        policy.entitlements.draw_source_order.indexOf(b.source_kind) ||
      a.id.localeCompare(b.id),
  );
}

export function grantExpiry(grant: GrantRow, end: Date | null): Date | null {
  const time = expiryMs(grant, end);
  return time === -Infinity
    ? new Date('0001-01-01T00:00:00Z')
    : time === null
      ? null
      : new Date(time);
}
