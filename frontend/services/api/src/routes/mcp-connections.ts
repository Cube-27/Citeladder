import { mcpConnectionSchema } from '@citeladder/contracts/mcp';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import { listConnections, revokeConnection } from '../mcp/connections.ts';
import { defineDeleteRoute, defineGetRoute, type ProductRoute } from './define.ts';

const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const own = '/api/v1/mcp/connections';
const workspace = '/api/v1/workspaces/{workspace_id}/mcp/connections';
const session = { family: 'mcp-connections', authorize: 'session' } as const;
const admin = {
  family: 'mcp-connections',
  authorize: 'workspace-path',
  capability: 'manage_members',
} as const;
const connections = z.array(mcpConnectionSchema);

async function revoke(
  db: Database,
  grantId: string,
  scope: { userId: string; workspaceId?: string },
) {
  if (!(await revokeConnection(db, grantId, scope))) throw notFound('Connection');
}

export const MCP_CONNECTION_ROUTES: readonly ProductRoute[] = [
  defineGetRoute({
    ...session,
    path: own,
    params: { path: {}, query: {} },
    response: connections,
    handle: ({ c, db }) => listConnections(db, { userId: c.get('user').id }),
  }),
  defineDeleteRoute({
    ...session,
    path: `${own}/{grant_id}`,
    params: { path: { grant_id: uuid }, query: {} },
    handle: ({ c, db }, { path }) => revoke(db, path.grant_id, { userId: c.get('user').id }),
  }),
  defineGetRoute({
    ...admin,
    path: workspace,
    params: { path: { workspace_id: uuid }, query: {} },
    response: connections,
    handle: ({ c, db }, { path }) =>
      listConnections(db, { userId: c.get('user').id, workspaceId: path.workspace_id }),
  }),
  defineDeleteRoute({
    ...admin,
    path: `${workspace}/{grant_id}`,
    params: { path: { workspace_id: uuid, grant_id: uuid }, query: {} },
    handle: ({ c, db }, { path }) =>
      revoke(db, path.grant_id, { userId: c.get('user').id, workspaceId: path.workspace_id }),
  }),
];
