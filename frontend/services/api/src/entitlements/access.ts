import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { accountState } from './state.ts';
import { policy } from '../config.ts';

export type WorkspaceAccess = 'active' | 'trial_active' | 'trial_expired' | 'access_unresolved';

/** Persisted authority plus wall time; this read never repairs a projection. */
export async function workspaceAccess(
  db: Database,
  workspaceId: string,
  at = new Date(),
): Promise<{ status: WorkspaceAccess; expires_at: string | null }> {
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  const unresolved = { status: 'access_unresolved' as const, expires_at: null };
  if (!account || account.status !== 'active') return unresolved;
  const state = await accountState(db, workspaceId, account.id, at);
  if (state.error) return unresolved;
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
    account.registration_origin !== 'public' &&
    selected.some((grant) => grant.bundle_role === 'primary')
  )
    return { status: 'active', expires_at: state.validUntil?.toISOString() ?? null };
  const trial = state.grants.find(
    (grant) =>
      grant.profile_key === policy.entitlements.public_trial.profile &&
      grant.key === 'workspace_access',
  );
  if (trial?.valid_until && at >= trial.valid_until)
    return { status: 'trial_expired', expires_at: trial.valid_until.toISOString() };
  return unresolved;
}

export async function requireWorkspaceAccess(db: Database, workspaceId: string) {
  const access = await workspaceAccess(db, workspaceId);
  if (access.status === 'trial_expired' || access.status === 'access_unresolved')
    throw new ApiError(
      403,
      access.status === 'trial_expired'
        ? 'Your trial has expired. Contact support to restore access.'
        : 'Workspace access is unavailable. Contact support.',
      { code: access.status },
    );
  return access;
}
