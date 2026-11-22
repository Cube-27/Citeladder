import { randomUUID } from 'node:crypto';
import type { ServiceConfig } from '../src/config.ts';
import type { Database } from '../src/db/database.ts';
import type { McpPrincipal } from '../src/mcp/types.ts';
import { dispatchWrite } from '../src/mcp/write-tools.ts';

type Tenant = { userId: string; workspaceId: string };

export function mcpWrites(db: Database, config: ServiceConfig) {
  const clients: string[] = [];

  async function connection(
    tenant: Tenant,
    scopes = ['citeladder:read', 'citeladder:write'],
  ): Promise<McpPrincipal> {
    const clientId = randomUUID();
    clients.push(clientId);
    await db
      .insertInto('mcp_oauth_clients')
      .values({
        id: randomUUID(),
        client_id: clientId,
        client_metadata: JSON.stringify({ client_name: 'test' }),
        client_secret_encrypted: '',
        created_at: new Date(),
      })
      .execute();
    const principal = {
      userId: tenant.userId,
      grantId: randomUUID(),
      workspaceIds: [tenant.workspaceId],
      tokenHash: randomUUID(),
      canWrite: scopes.includes('citeladder:write'),
    };
    await db
      .insertInto('mcp_oauth_grants')
      .values({
        id: principal.grantId,
        client_id: clientId,
        user_id: tenant.userId,
        workspace_ids: JSON.stringify(principal.workspaceIds),
        scopes: JSON.stringify(scopes),
        resource: 'https://protocol.example.test/mcp',
        access_token_hash: principal.tokenHash,
        refresh_token_hash: randomUUID(),
        access_expires_at: new Date(Date.now() + 3600000),
        refresh_expires_at: new Date(Date.now() + 7200000),
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    return principal;
  }

  const call = (
    principal: McpPrincipal,
    name: Parameters<typeof dispatchWrite>[1],
    args: unknown,
  ) => dispatchWrite({ db, config, principal, origin: 'https://app.example.test' }, name, args);

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => 'succeeded',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );

  async function setRole(tenant: Tenant, role: string) {
    await db
      .updateTable('workspace_members')
      .set({ role })
      .where('user_id', '=', tenant.userId)
      .where('workspace_id', '=', tenant.workspaceId)
      .execute();
  }

  async function cleanup() {
    if (clients.length)
      await db.deleteFrom('mcp_oauth_clients').where('client_id', 'in', clients).execute();
  }

  return { connection, call, failure, setRole, cleanup };
}
