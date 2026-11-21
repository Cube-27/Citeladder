import type { z } from 'zod';
import type { workspaceAccessSchema } from '@citeladder/contracts/auth';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { entitlementOf, grantExpiry, loadAccountState, type AccountState } from './state.ts';
import { policy } from '../config.ts';
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import { lockedGrants } from './occupancy.ts';

export type WorkspaceAccess = z.infer<typeof workspaceAccessSchema>['status'];

type DeniedAccess = Exclude<WorkspaceAccess, 'active' | 'trial_active'>;

const DENIALS: Record<DeniedAccess, string> = {
  trial_expired: 'Your trial has expired. Contact support to restore access.',
  subscription_lapsed: 'Your plan has ended. Contact support to restore access.',
  access_unresolved: 'Workspace access is unavailable. Contact support.',
};

export function accessGranted(status: WorkspaceAccess): status is 'active' | 'trial_active' {
  return status === 'active' || status === 'trial_active';
}

type AccessResult = { status: WorkspaceAccess; expires_at: string | null };

export async function workspaceAccess(
  db: Database,
  workspaceId: string,
  at = new Date(),
): Promise<AccessResult> {
  return accessOf(await loadAccountState(db, workspaceId, at), at);
}

function accessOf(state: AccountState | null, at: Date): AccessResult {
  const unresolved = { status: 'access_unresolved' as const, expires_at: null };
  if (state?.account.status !== 'active' || state.error) return unresolved;
  const { account } = state;
  const selected = state.grants.filter((grant) =>
    state.selected.some((row) => row.id === grant.id),
  );
  // New public accounts need explicit primary access; supplements cannot restore it.
  const authority =
    selected.find(
      (grant) =>
        grant.key === 'workspace_access' && grant.value === 1 && grant.source_kind === 'override',
    ) ??
    selected.find(
      (grant) =>
        grant.key === 'workspace_access' && grant.value === 1 && grant.bundle_role === 'primary',
    );
  if (authority)
    return {
      status:
        authority.profile_key === policy.entitlements.public_trial.profile
          ? 'trial_active'
          : 'active',
      expires_at: authority.valid_until?.toISOString() ?? null,
    };
  if (
    account.registration_origin === 'operator' &&
    selected.some((grant) => grant.bundle_role === 'primary')
  )
    return { status: 'active', expires_at: state.validUntil?.toISOString() ?? null };
  const ends = state.grants
    .filter(
      (grant) =>
        grant.key === 'workspace_access' && grant.source_kind === 'plan' && grant.valid_from <= at,
    )
    .flatMap((grant) => {
      const expiry = grantExpiry(grant, state.end)?.getTime() ?? Infinity;
      const end = Math.min(expiry, state.revokedAt.get(grant.id)?.getTime() ?? Infinity);
      return end <= at.getTime() ? [end] : [];
    });
  if (ends.length)
    return { status: 'subscription_lapsed', expires_at: new Date(Math.max(...ends)).toISOString() };
  const trial = state.grants.find(
    (grant) =>
      grant.profile_key === policy.entitlements.public_trial.profile &&
      grant.key === 'workspace_access' &&
      (!state.revokedAt.has(grant.id) || state.revokedAt.get(grant.id)! >= grant.valid_until!),
  );
  if (trial?.valid_until && at >= trial.valid_until)
    return { status: 'trial_expired', expires_at: trial.valid_until.toISOString() };
  return unresolved;
}

function admitted(access: AccessResult): AccessResult {
  if (!accessGranted(access.status))
    throw new ApiError(403, DENIALS[access.status], { code: access.status });
  return access;
}

export async function requireWorkspaceAccess(db: Database, workspaceId: string) {
  return admitted(await workspaceAccess(db, workspaceId));
}

export class WorkspaceEntitlements {
  readonly workspaceId: string;
  readonly #db: Database;
  readonly #at: Date;
  #state: Promise<AccountState | null> | undefined;

  constructor(db: Database, workspaceId: string, at = new Date()) {
    this.#db = db;
    this.workspaceId = workspaceId;
    this.#at = at;
  }

  #load(): Promise<AccountState | null> {
    this.#state ??= loadAccountState(this.#db, this.workspaceId, this.#at);
    return this.#state;
  }

  async requireAccess(): Promise<AccessResult> {
    return admitted(accessOf(await this.#load(), this.#at));
  }

  async granted(): Promise<ReadonlyMap<string, number> | null> {
    const entitlement = entitlementOf(await this.#load());
    return entitlement.status === 'resolved' ? entitlement.values : null;
  }

  async grants(key: string): Promise<boolean> {
    return ((await this.granted())?.get(key) ?? 0) >= 1;
  }

  async requireFlag(key: GatedFlag): Promise<void> {
    const { values } = await lockedGrants(this.#db, this.workspaceId, this.#at);
    if ((values.get(key) ?? 0) >= 1) return;
    const refusal = policy.entitlements.flag_refusals[key];
    throw new ApiError(refusal.status === 409 ? 409 : 403, refusal.message, {
      code: asApiErrorCode(refusal.code),
      details: { key },
    });
  }
}

export type GatedFlag = keyof typeof policy.entitlements.flag_refusals;

export function requireFlag(db: Database, workspaceId: string, key: GatedFlag): Promise<void> {
  return new WorkspaceEntitlements(db, workspaceId).requireFlag(key);
}

/**
 * Whether the workspace holds the non-public `operator_controls` grant (BL9):
 * the operator's own workspace, granted explicitly with `billing:admin grant`.
 * It never extends to another workspace and is never part of bootstrap access.
 */
export function hasOperatorControls(db: Database, workspaceId: string): Promise<boolean> {
  return new WorkspaceEntitlements(db, workspaceId).grants(policy.entitlements.operator_controls);
}

export function cachedWorkspaceAccess(db: Database, ttlMs: number, now = () => performance.now()) {
  const granted = new Map<string, { until: number; check: Promise<unknown> }>();
  return (workspaceId: string) => {
    const cached = granted.get(workspaceId);
    if (cached && now() < cached.until) return cached.check;
    const check = requireWorkspaceAccess(db, workspaceId);
    const entry = { until: now() + ttlMs, check };
    granted.set(workspaceId, entry);
    check.then(
      ({ expires_at: expiresAt }) => {
        if (expiresAt)
          entry.until = Math.min(entry.until, now() + (Date.parse(expiresAt) - Date.now()));
      },
      () => {
        if (granted.get(workspaceId)?.check === check) granted.delete(workspaceId);
      },
    );
    return check;
  };
}
