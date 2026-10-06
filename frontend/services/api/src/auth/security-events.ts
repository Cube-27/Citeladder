import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.ts';

type SecurityEvent =
  | 'auth.challenge_issued'
  | 'auth.email_verified'
  | 'auth.password_reset'
  | 'auth.password_changed'
  | 'acquisition.control'
  | 'policy.enterprise_reference'
  | 'crawl_log.create'
  | 'crawl_log.rotate'
  | 'crawl_log.revoke'
  | 'credential.create'
  | 'credential.update'
  | 'credential.delete'
  | 'auth.login'
  | 'auth.google_login'
  | 'auth.logout'
  | 'policy.accept'
  | 'membership.role'
  | 'membership.remove'
  | 'membership.leave'
  | 'membership.transfer'
  | 'membership.join'
  | 'mcp.consent'
  | 'mcp.revoke'
  | 'mcp.workspace_revoke';

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
