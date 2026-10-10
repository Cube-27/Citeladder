/**
 * Durable fixed-window usage counters (`usage_windows`) keyed by a hashed,
 * case-folded subject.
 *
 * A request consumes its budget in its own committed transaction before the
 * work it guards starts, so a failed import still spends its attempt.
 */
import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'kysely';

import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { policy, resolveSettingSpec } from '../config.ts';
import { getLogger } from '../logging.ts';

type SubjectKind =
  | 'workspace'
  | 'client'
  | 'email'
  | 'crawl_source'
  | 'crawl_project'
  | 'global'
  | 'mcp_grant'
  | 'user';

export type UsageLimit = {
  operation: string;
  limit: number;
  windowSeconds: number;
  amount?: number;
};

export function agentCallLimit(amount: number): UsageLimit {
  return {
    operation: 'agent.provider_call',
    limit: resolveSettingSpec(policy.abuse.agent_call_limit) as number,
    windowSeconds: resolveSettingSpec(policy.abuse.agent_call_window_seconds) as number,
    amount,
  };
}

/** Consume one unit for the workspace, or throw 429 with `Retry-After`. */
export async function enforceWorkspaceRequest(
  db: Database,
  workspaceId: string,
  { operation, limit, windowSeconds, amount = 1 }: UsageLimit,
  now: Date = new Date(),
): Promise<void> {
  return enforceSubjectRequest(
    db,
    'workspace',
    workspaceId,
    { operation, limit, windowSeconds, amount },
    now,
  );
}

/** Autocommitted atomic counters, before hashing or provider I/O. */
export async function enforceSubjectRequest(
  db: Database,
  subjectKind: SubjectKind,
  subjectValue: string,
  { operation, limit, windowSeconds, amount = 1 }: UsageLimit,
  now: Date = new Date(),
): Promise<void> {
  if (![limit, windowSeconds, amount].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error('Usage limit, window and amount must be positive integers');
  }
  const {
    subject_hash: subject,
    started,
    expires,
  } = windowOf(subjectKind, subjectValue, windowSeconds, now);
  const retryAfter = Math.max(1, Math.ceil((expires.getTime() - now.getTime()) / 1000));
  const exhausted = () =>
    new ApiError(
      429,
      subjectKind === 'workspace' ? 'Workspace usage limit exceeded' : 'Too many requests',
      { headers: { 'retry-after': String(retryAfter) } },
    );
  if (amount > limit) throw exhausted();
  const consumed = await db
    .insertInto('usage_windows')
    .values({
      id: randomUUID(),
      subject_kind: subjectKind,
      subject_hash: subject,
      operation,
      window_started_at: started,
      expires_at: expires,
      count: amount,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) =>
      conflict
        .constraint('uq_usage_window_subject_operation_start')
        .doUpdateSet({ count: sql`usage_windows.count + ${amount}`, updated_at: now })
        .where(sql<boolean>`usage_windows.count + ${amount} <= ${limit}`),
    )
    .returning('count')
    .executeTakeFirst();
  if (consumed !== undefined) return;
  getLogger('api.abuse').info('request.throttled', { operation, subject_kind: subjectKind });
  throw exhausted();
}

function windowOf(
  subjectKind: SubjectKind,
  subjectValue: string,
  windowSeconds: number,
  now: Date,
) {
  const epoch = Math.floor(now.getTime() / 1000);
  const startedEpoch = epoch - (epoch % windowSeconds);
  return {
    subject_kind: subjectKind,
    subject_hash: createHash('sha256').update(subjectValue.trim().toLowerCase()).digest('hex'),
    started: new Date(startedEpoch * 1000),
    expires: new Date((startedEpoch + windowSeconds) * 1000),
  };
}

/**
 * Refuse with 429 when the subject's current window is already spent, without
 * consuming it. Guards work that is only counted when it fails (a wrong
 * password), so the check must precede the work.
 */
export async function requireSubjectBudget(
  db: Database,
  subjectKind: SubjectKind,
  subjectValue: string,
  { operation, limit, windowSeconds }: UsageLimit,
  now: Date = new Date(),
): Promise<void> {
  const window = windowOf(subjectKind, subjectValue, windowSeconds, now);
  const spent = await db
    .selectFrom('usage_windows')
    .select('count')
    .where('subject_kind', '=', window.subject_kind)
    .where('subject_hash', '=', window.subject_hash)
    .where('operation', '=', operation)
    .where('window_started_at', '=', window.started)
    .executeTakeFirst();
  if (spent === undefined || spent.count < limit) return;
  getLogger('api.abuse').info('request.throttled', { operation, subject_kind: subjectKind });
  const retryAfter = Math.max(1, Math.ceil((window.expires.getTime() - now.getTime()) / 1000));
  throw new ApiError(429, 'Too many requests', { headers: { 'retry-after': String(retryAfter) } });
}

/** Forget every window of one subject's operation (a proven owner resets their failures). */
export async function releaseSubjectBudget(
  db: Database,
  subjectKind: SubjectKind,
  subjectValue: string,
  operation: string,
): Promise<void> {
  await db
    .deleteFrom('usage_windows')
    .where('subject_kind', '=', subjectKind)
    .where('subject_hash', '=', windowOf(subjectKind, subjectValue, 1, new Date()).subject_hash)
    .where('operation', '=', operation)
    .execute();
}

/** Delete a bounded batch of expired windows; live windows are never touched. */
export async function pruneUsageWindows(
  db: Database,
  now: Date,
  batch: number,
  canAdmit: () => boolean = () => true,
): Promise<number> {
  if (!canAdmit()) return 0;
  return db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom('usage_windows')
      .select('id')
      .where('expires_at', '<=', now)
      .orderBy('expires_at')
      .limit(batch)
      .forUpdate()
      .skipLocked()
      .execute();
    if (!rows.length) return 0;
    const deleted = await trx
      .deleteFrom('usage_windows')
      .where(
        'id',
        'in',
        rows.map((row) => row.id),
      )
      .executeTakeFirst();
    return Number(deleted.numDeletedRows);
  });
}
