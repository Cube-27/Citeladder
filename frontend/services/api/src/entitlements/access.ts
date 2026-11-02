import type { z } from 'zod';
import type { workspaceAccessSchema } from '@citeladder/contracts/auth';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { entitlementOf, grantExpiry, loadAccountState, type AccountState } from './state.ts';
import { policy } from '../config.ts';

export type WorkspaceAccess = z.infer<typeof workspaceAccessSchema>['status'];

type DeniedAccess = Exclude<WorkspaceAccess, 'active' | 'trial_active'>;

/** The message a request refused in each denied state carries. */
const DENIALS: Record<DeniedAccess, string> = {
  trial_expired: 'Your trial has expired. Contact support to restore access.',
  subscription_lapsed: 'Your plan has ended. Contact support to restore access.',
  access_unresolved: 'Workspace access is unavailable. Contact support.',
};

/** Whether this access state admits work in the workspace. */
export function accessGranted(status: WorkspaceAccess): status is 'active' | 'trial_active' {
  return status === 'active' || status === 'trial_active';
}

type AccessResult = { status: WorkspaceAccess; expires_at: string | null };

/** Persisted authority plus wall time; this read never repairs a projection. */
export async function workspaceAccess(
  db: Database,
  workspaceId: string,
  at = new Date(),
): Promise<AccessResult> {
  return accessOf(await loadAccountState(db, workspaceId, at), at);
}

/** The access a loaded account state grants at `at`. */
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
  // A paid plan's access that took effect and has ended: a lapsed customer,
  // whatever trial preceded it.
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

/** The access result, or the 403 its denied state carries. */
function admitted(access: AccessResult): AccessResult {
  if (!accessGranted(access.status))
    throw new ApiError(403, DENIALS[access.status], { code: access.status });
  return access;
}

export async function requireWorkspaceAccess(db: Database, workspaceId: string) {
  return admitted(await workspaceAccess(db, workspaceId));
}

/**
 * One workspace's entitlement state, read once on first use and then shared by
 * everything that asks: the access gate, capability flags and allowances. A
 * request keeps one on its context (`entitlements`), so a revocation applies
 * from the next request; it is never kept across requests. Code holding a
 * transaction, or a worker, builds its own from that executor.
 */
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

  /** 403 unless the workspace's access state admits work. */
  async requireAccess(): Promise<AccessResult> {
    return admitted(accessOf(await this.#load(), this.#at));
  }

  /** The granted capability values; `null` when the account is missing or unresolvable. */
  async granted(): Promise<ReadonlyMap<string, number> | null> {
    const entitlement = entitlementOf(await this.#load());
    return entitlement.status === 'resolved' ? entitlement.values : null;
  }

  /** Whether the plan currently grants flag `key`; unresolvable grants fail closed. */
  async grants(key: string): Promise<boolean> {
    return ((await this.granted())?.get(key) ?? 0) >= 1;
  }
}

/**
 * `requireWorkspaceAccess` for a long-running worker: a grant is reused for
 * `ttlMs`, so a revocation takes effect within that window, while a denial or
 * failure is never cached and concurrent checks share one read. Requests never
 * use it: they read access once per request (`WorkspaceEntitlements`).
 */
export function cachedWorkspaceAccess(db: Database, ttlMs: number, now = () => performance.now()) {
  const granted = new Map<string, { until: number; check: Promise<unknown> }>();
  return (workspaceId: string) => {
    const cached = granted.get(workspaceId);
    if (cached && now() < cached.until) return cached.check;
    const check = requireWorkspaceAccess(db, workspaceId);
    const entry = { until: now() + ttlMs, check: check as Promise<unknown> };
    granted.set(workspaceId, entry);
    check.then(
      // A grant that ends inside the window (a trial) is reused only until it ends.
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
