import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { record, strings } from '../db/json.ts';
import { scalarText } from '../text-order.ts';
import { mcpPolicy } from './config.ts';

/**
 * A connection names the workspaces it may read, never their IDs alone. The
 * personal view lists the grant's workspaces the account still belongs to; an
 * Owner/Admin sees only their own workspace and which account connected.
 */
export async function listConnections(
  db: Database,
  scope: { userId: string; workspaceId?: string },
) {
  let query = db
    .selectFrom('mcp_oauth_grants as g')
    .innerJoin('mcp_oauth_clients as c', 'c.client_id', 'g.client_id')
    .innerJoin('users as u', 'u.id', 'g.user_id')
    .select([
      'g.id',
      'g.user_id',
      'g.workspace_ids',
      'g.scopes',
      'g.created_at',
      'g.last_used_at',
      'c.client_metadata',
      'u.email',
    ])
    .where('g.revoked_at', 'is', null)
    .where('g.refresh_expires_at', '>', new Date());
  if (scope.workspaceId)
    query = query.where(
      sql<boolean>`g.workspace_ids @> ${JSON.stringify([scope.workspaceId])}::jsonb`,
    );
  else query = query.where('g.user_id', '=', scope.userId);
  const rows = await query.orderBy('g.created_at', 'desc').execute();
  const names = await workspaceNames(
    db,
    scope.workspaceId ? [scope.workspaceId] : rows.flatMap((row) => strings(row.workspace_ids)),
    scope.workspaceId ? null : scope.userId,
  );
  return rows.map((row) => {
    const granted = scope.workspaceId ? [scope.workspaceId] : strings(row.workspace_ids);
    return {
      id: row.id,
      client_name: (scalarText(record(row.client_metadata).client_name) || 'MCP client').slice(
        0,
        255,
      ),
      workspaces: granted.flatMap((id) => {
        const name = names.get(id);
        return name === undefined ? [] : [{ id, name }];
      }),
      user_email: scope.workspaceId ? row.email : null,
      access: strings(row.scopes).includes(mcpPolicy.write_scope)
        ? ('read_and_change' as const)
        : ('read' as const),
      created_at: row.created_at.toISOString(),
      last_used_at: row.last_used_at?.toISOString() ?? null,
      requires_consent: strings(row.workspace_ids).length === 0,
    };
  });
}

/** Names of the given workspaces, limited to the member's own when one is named. */
async function workspaceNames(db: Database, ids: string[], memberId: string | null) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, string>();
  let query = db
    .selectFrom('workspaces as w')
    .select(['w.id', 'w.name'])
    .where('w.id', 'in', unique)
    .where('w.is_system', '=', false);
  if (memberId)
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom('workspace_members as m')
          .select('m.id')
          .whereRef('m.workspace_id', '=', 'w.id')
          .where('m.user_id', '=', memberId),
      ),
    );
  return new Map((await query.execute()).map((row) => [row.id, row.name]));
}
/** The grant's workspace list with one workspace removed. */
const withoutWorkspace = (workspaceId: string) => sql<string>`workspace_ids - ${workspaceId}::text`;

/**
 * A person who leaves or is removed from a workspace takes it out of every MCP
 * grant they hold, in the membership transaction, so a later re-invitation
 * needs fresh consent before an MCP client can read it again.
 */
export async function dropWorkspaceFromGrants(trx: Database, userId: string, workspaceId: string) {
  await trx
    .updateTable('mcp_oauth_grants')
    .set({ workspace_ids: withoutWorkspace(workspaceId), updated_at: new Date() })
    .where('user_id', '=', userId)
    .where(sql<boolean>`workspace_ids @> ${JSON.stringify([workspaceId])}::jsonb`)
    .execute();
}

export function revokeConnection(
  db: Database,
  grantId: string,
  scope: { userId: string; workspaceId?: string },
) {
  return db.transaction().execute(async (trx) => {
    let query = trx.selectFrom('mcp_oauth_grants').selectAll().where('id', '=', grantId);
    if (scope.workspaceId)
      query = query.where(
        sql<boolean>`workspace_ids @> ${JSON.stringify([scope.workspaceId])}::jsonb`,
      );
    else query = query.where('user_id', '=', scope.userId);
    const row = await query.forUpdate().executeTakeFirst();
    if (!row) return false;
    if (scope.workspaceId)
      await trx
        .updateTable('mcp_oauth_grants')
        .set({ workspace_ids: withoutWorkspace(scope.workspaceId), updated_at: new Date() })
        .where('id', '=', grantId)
        .execute();
    else
      await trx
        .updateTable('mcp_oauth_grants')
        .set({ revoked_at: row.revoked_at ?? new Date(), updated_at: new Date() })
        .where('id', '=', grantId)
        .execute();
    await recordSecurityEvent(
      trx,
      scope.workspaceId ? 'mcp.workspace_revoke' : 'mcp.revoke',
      scope.userId,
      scope.workspaceId ?? null,
      grantId,
    );
    return true;
  });
}
