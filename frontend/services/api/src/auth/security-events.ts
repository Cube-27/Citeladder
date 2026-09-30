import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';

type SecurityEvent =
  | 'auth.login'
  | 'auth.google_login'
  | 'auth.logout'
  | 'policy.accept'
  | 'membership.role'
  | 'membership.remove'
  | 'membership.leave'
  | 'membership.transfer'
  | 'membership.join';

/** Append in the mutation transaction; no arbitrary payload or secrets. */
export async function recordSecurityEvent(
  db: Database,
  event: SecurityEvent,
  actorId: string,
  workspaceId: string | null = null,
  targetId: string | null = null,
): Promise<void> {
  await db
    .insertInto('security_events')
    .values({
      id: randomUUID(),
      event,
      actor_id: actorId,
      workspace_id: workspaceId,
      target_id: targetId,
      occurred_at: new Date(),
    })
    .execute();
}
