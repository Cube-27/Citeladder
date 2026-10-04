import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';

/** Bounded identity operators serialize before row locks, including cross-workspace resets. */
export function lockIdentityAdministration(db: Database) {
  return subjectXactLock(db, 'operator.identity.administration');
}

/** Operator admission is independent of customer workspace roles. Held until commit. */
export async function requirePlatformAdmin(db: Database, email: string) {
  await lockIdentityAdministration(db);
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email.trim().toLowerCase())
    .where('is_active', '=', true)
    .where('role', '=', 'admin')
    .forUpdate()
    .executeTakeFirst();
  if (!actor) throw new Error('An active platform administrator is required');
  return actor;
}
