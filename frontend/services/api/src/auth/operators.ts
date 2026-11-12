import type { Database } from '../db/database.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import { parseUuid } from '../http/uuid.ts';

/** Bounded identity operators serialize before row locks, including cross-workspace resets. */
export function lockIdentityAdministration(db: Database) {
  return subjectXactLock(db, 'operator.identity.administration');
}

/** The refusal when the acting identity is not an active platform administrator. */
export class PlatformAdminRequired extends Error {
  constructor() {
    super('An active platform administrator is required');
    this.name = 'PlatformAdminRequired';
  }
}

/** Operator admission is independent of customer workspace roles. Held until commit. */
export async function requirePlatformAdmin(db: Database, email: string) {
  await lockIdentityAdministration(db);
  const identity = parseUuid(email);
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where(identity ? 'id' : 'email', '=', identity ?? email.trim().toLowerCase())
    .where('is_active', '=', true)
    .where('role', '=', 'admin')
    .forUpdate()
    .executeTakeFirst();
  if (!actor) throw new PlatformAdminRequired();
  return actor;
}
