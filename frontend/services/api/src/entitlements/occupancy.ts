/**
 * Prompt-slot occupancy: persisted prompts in the account's workspace
 * against the resolved `prompt_slots` allowance.
 *
 * Every prompt in the workspace counts, whatever its status or origin; only
 * deletion frees a slot. The check runs under the account capacity lock in
 * the same transaction as the insert it guards, so concurrent writers on
 * cannot exceed the grant. The capacity lock is the last lock a path takes
 * after the project and prompt-set locks.
 *
 * Fail closed: a workspace with no billing account, or an account whose
 * grants cannot resolve, is a 403 `occupancy_unresolved`. A resolved account
 * with no `prompt_slots` grant is unprovisioned and not gated.
 */
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { resolveAccountEntitlement } from './resolve.ts';

const logger = getLogger('api.entitlements');
const { capacity_lock: CAPACITY_LOCK, codes, prompt_slots: PROMPT_SLOTS } = policy.entitlements;
const UNRESOLVED = asApiErrorCode(codes.unresolved);
const LIMIT_EXCEEDED = asApiErrorCode(codes.limit_exceeded);

/** The workspace's billing account, locked for capacity checks, or a 403. */
export async function lockWorkspaceCapacity(db: Database, workspaceId: string): Promise<string> {
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  if (account === undefined) {
    logger.info('billing.occupancy_unresolved', {
      workspace_id: workspaceId,
      error: 'workspace_billing_account_missing',
    });
    throw new ApiError(403, 'Billing entitlement is unavailable for this workspace', {
      code: UNRESOLVED,
    });
  }
  await advisoryXactLock(db, CAPACITY_LOCK, account.id);
  return account.id;
}

export async function admitProject(db: Database, workspaceId: string): Promise<void> {
  const accountId = await lockWorkspaceCapacity(db, workspaceId);
  const resolved = await resolveAccountEntitlement(db, { accountId, workspaceId }, new Date());
  if (resolved.status !== 'resolved')
    throw new ApiError(403, 'Billing entitlement is unavailable for this account', {
      code: UNRESOLVED,
    });
  const key = policy.entitlements.project_slots;
  const allowance = resolved.values.get(key);
  if (allowance === undefined) return;
  const row = await db
    .selectFrom('projects')
    .innerJoin('billing_accounts', 'billing_accounts.workspace_id', 'projects.workspace_id')
    .select(sql<string>`count(*)`.as('count'))
    .where('billing_accounts.id', '=', accountId)
    .executeTakeFirstOrThrow();
  const current = Number(row.count);
  if (current + 1 > allowance)
    throw new ApiError(403, `The request would exceed the account's ${key} allowance`, {
      code: LIMIT_EXCEEDED,
      details: { key, allowance, current, requested: 1 },
    });
}

export async function requireProjectDeletion(db: Database, workspaceId: string): Promise<void> {
  const accountId = await lockWorkspaceCapacity(db, workspaceId);
  const resolved = await resolveAccountEntitlement(db, { accountId, workspaceId }, new Date());
  if (resolved.status !== 'resolved')
    throw new ApiError(403, 'Billing entitlement is unavailable for this account', {
      code: UNRESOLVED,
    });
  const key = policy.entitlements.project_deletion;
  if ((resolved.values.get(key) ?? 0) < 1)
    throw new ApiError(403, 'Project deletion is not granted for this workspace', {
      code: asApiErrorCode(codes.capability_not_granted),
      details: { key },
    });
}

async function promptCount(db: Database, accountId: string): Promise<number> {
  const row = await db
    .selectFrom('prompts')
    .innerJoin('prompt_sets', 'prompt_sets.id', 'prompts.prompt_set_id')
    .innerJoin('projects', 'projects.id', 'prompt_sets.project_id')
    .innerJoin('billing_accounts', 'billing_accounts.workspace_id', 'projects.workspace_id')
    .select(sql<string>`count(*)`.as('count'))
    .where('billing_accounts.id', '=', accountId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/**
 * Admit `requested` new prompts for the workspace, or throw a 403. Takes the
 * capacity lock; the caller inserts in the same transaction.
 */
export async function admitPrompts(
  db: Database,
  workspaceId: string,
  requested: number,
): Promise<void> {
  const accountId = await lockWorkspaceCapacity(db, workspaceId);
  const entitlement = await resolveAccountEntitlement(db, { accountId, workspaceId }, new Date());
  if (entitlement.status !== 'resolved') {
    logger.info('billing.occupancy_unresolved', {
      account_id: accountId,
      key: PROMPT_SLOTS,
      errors: entitlement.error,
    });
    throw new ApiError(403, 'Billing entitlement is unavailable for this account', {
      code: UNRESOLVED,
    });
  }
  const allowance = entitlement.values.get(PROMPT_SLOTS);
  if (allowance === undefined) return;
  const current = await promptCount(db, accountId);
  if (current + requested <= allowance) return;
  logger.info('billing.occupancy_limit_exceeded', {
    account_id: accountId,
    key: PROMPT_SLOTS,
    allowance,
    current,
    requested,
  });
  throw new ApiError(
    403,
    `The request would exceed the account's ${PROMPT_SLOTS} allowance ` +
      `(${current} in use, ${requested} requested, allowance ${allowance})`,
    {
      code: LIMIT_EXCEEDED,
      details: { key: PROMPT_SLOTS, allowance, current, requested },
    },
  );
}
