import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { record, strings } from '../db/json.ts';
import { scalarText } from '../text-order.ts';

export async function listConnections(
  db: Database,
  scope: { userId: string; workspaceId?: string },
) {
  let query = db
    .selectFrom('mcp_oauth_grants as g')
    .innerJoin('mcp_oauth_clients as c', 'c.client_id', 'g.client_id')
    .select(['g.id', 'g.workspace_ids', 'g.created_at', 'c.client_metadata'])
    .where('g.revoked_at', 'is', null)
    .where('g.refresh_expires_at', '>', new Date());
  if (scope.workspaceId)
    query = query.where(
      sql<boolean>`g.workspace_ids @> ${JSON.stringify([scope.workspaceId])}::jsonb`,
    );
  else query = query.where('g.user_id', '=', scope.userId);
  return (await query.orderBy('g.created_at', 'desc').execute()).map((row) => ({
    id: row.id,
    client_name: (scalarText(record(row.client_metadata).client_name) || 'MCP client').slice(
      0,
      255,
    ),
    workspace_ids: scope.workspaceId ? [scope.workspaceId] : strings(row.workspace_ids),
    created_at: row.created_at.toISOString(),
    requires_consent: strings(row.workspace_ids).length === 0,
  }));
}
export async function revokeConnection(
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
        .set({
          workspace_ids: JSON.stringify(
            strings(row.workspace_ids).filter((id) => id !== scope.workspaceId),
          ),
          updated_at: new Date(),
        })
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
