/**
 * Durable per-workspace usage windows (`usage_windows`), shared with the
 * Python limiter (`app/domain/abuse/service.py`) while both stacks count the
 * same operations: the subject hash, fixed window start and conflict target
 * are identical, so one budget spans both.
 *
 * A request consumes its budget in its own committed transaction before the
 * work it guards starts, so a failed import still spends its attempt.
 */
import { createHash, randomUUID } from 'node:crypto';

import { sql } from 'kysely';

import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';

export type UsageLimit = { operation: string; limit: number; windowSeconds: number };

/** Consume one unit for the workspace, or throw 429 with `Retry-After`. */
export async function enforceWorkspaceRequest(
  db: Database,
  workspaceId: string,
  { operation, limit, windowSeconds }: UsageLimit,
  now: Date = new Date(),
): Promise<void> {
  const epoch = Math.floor(now.getTime() / 1000);
  const startedEpoch = epoch - (epoch % windowSeconds);
  const started = new Date(startedEpoch * 1000);
  const expires = new Date((startedEpoch + windowSeconds) * 1000);
  const subject = createHash('sha256').update(workspaceId.trim().toLowerCase()).digest('hex');
  const consumed = await db
    .insertInto('usage_windows')
    .values({
      id: randomUUID(),
      subject_kind: 'workspace',
      subject_hash: subject,
      operation,
      window_started_at: started,
      expires_at: expires,
      count: 1,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) =>
      conflict
        .constraint('uq_usage_window_subject_operation_start')
        .doUpdateSet({ count: sql`usage_windows.count + 1`, updated_at: now })
        .where(sql<boolean>`usage_windows.count + 1 <= ${limit}`),
    )
    .returning('count')
    .executeTakeFirst();
  if (consumed !== undefined) return;
  const retryAfter = Math.max(1, Math.ceil((expires.getTime() - now.getTime()) / 1000));
  throw new ApiError(429, 'Workspace usage limit exceeded', {
    headers: { 'retry-after': String(retryAfter) },
  });
}
