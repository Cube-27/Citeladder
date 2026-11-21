import type { Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import type {
  AccountGrants,
  BillingAccounts,
  BillingSubscriptions,
} from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import {
  CorruptGrant,
  entitlementChangeAt,
  expiryMs,
  selectedGrants,
  foldEntitlement,
  type Entitlement,
  type GrantRow,
  type RevocationRow,
} from './resolve.ts';

export async function loadAccountState(
  db: Database,
  workspaceId: string,
  at: Date,
  accountId?: string,
): Promise<AccountState | null> {
  // A workspace has one billing account (unique index), so rows joined through
  // the workspace are exactly that account's.
  const [account, grants, revocations, subscription] = await Promise.all([
    db
      .selectFrom('billing_accounts')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst(),
    db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .selectAll('account_grants')
      .where('billing_accounts.workspace_id', '=', workspaceId)
      .orderBy('account_grants.id')
      .execute(),
    db
      .selectFrom('grant_revocations')
      .innerJoin('account_grants', 'account_grants.id', 'grant_revocations.grant_id')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .select(['grant_revocations.grant_id', 'grant_revocations.effective_from'])
      .where('billing_accounts.workspace_id', '=', workspaceId)
      .execute(),
    db
      .selectFrom('billing_subscriptions')
      .innerJoin(
        'billing_accounts',
        'billing_accounts.id',
        'billing_subscriptions.billing_account_id',
      )
      .selectAll('billing_subscriptions')
      .where('billing_accounts.workspace_id', '=', workspaceId)
      .where('billing_subscriptions.is_current', '=', true)
      .where(
        'billing_subscriptions.subscription_kind',
        '=',
        policy.entitlements.base_subscription_kind,
      )
      .executeTakeFirst(),
  ]);
  if (account === undefined || (accountId !== undefined && account.id !== accountId)) return null;
  return foldState(account, grants, revocations, subscription ?? null, at);
}

export async function accountState(
  db: Database,
  workspaceId: string,
  accountId: string,
  at: Date,
): Promise<AccountState> {
  const state = await loadAccountState(db, workspaceId, at, accountId);
  if (state === null) throw new Error('Billing account is not in this workspace');
  return state;
}

export function entitlementOf(state: AccountState | null): Entitlement {
  if (state === null) return { status: 'unresolved', error: 'billing_account_missing' };
  if (state.error !== null) return { status: 'unresolved', error: state.error };
  return {
    status: 'resolved',
    values: state.values,
    validUntil: entitlementChangeAt(state.grants, state.revocations, state.end, state.at),
  };
}

export async function resolveAccountEntitlement(
  db: Database,
  { accountId, workspaceId }: { accountId: string; workspaceId: string },
  at: Date,
): Promise<Entitlement> {
  return entitlementOf(await loadAccountState(db, workspaceId, at, accountId));
}

export type AccountState = ReturnType<typeof foldState>;

function foldState(
  account: Selectable<BillingAccounts>,
  grants: Selectable<AccountGrants>[],
  revocations: RevocationRow[],
  subscription: Selectable<BillingSubscriptions> | null,
  at: Date,
) {
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
    if (!(cause instanceof CorruptGrant)) throw cause;
    error = cause.message;
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
    at,
    grants,
    revocations,
    revokedAt,
    subscription,
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
  if (time === null) return null;
  return time === -Infinity ? new Date('0001-01-01T00:00:00Z') : new Date(time);
}
