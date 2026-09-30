import { mcpConnectionSchema } from '@citeladder/contracts/mcp';
import { z } from 'zod';
import { sessionUser } from '../auth/session.ts';
import { workspaceMember } from '../auth/workspace.ts';
import { policy } from '../config.ts';
import { notFound } from '../errors.ts';
import { validateParams } from '../http/params.ts';
import { listConnections, revokeConnection } from '../mcp/connections.ts';
import type { ProductRoute } from './define.ts';

const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const own = '/api/v1/mcp/connections';
const workspace = '/api/v1/workspaces/{workspace_id}/mcp/connections';
function connectionRoute(
  path: string,
  method: 'get' | 'delete',
  byWorkspace: boolean,
): ProductRoute {
  const pathSpecs = {
    ...(byWorkspace ? { workspace_id: uuid } : {}),
    ...(method === 'delete' ? { grant_id: uuid } : {}),
  };
  const pathSchema = z.object({
    ...(byWorkspace ? { workspace_id: z.uuid() } : {}),
    ...(method === 'delete' ? { grant_id: z.uuid() } : {}),
  });
  return {
    contract: {
      family: 'mcp-connections',
      path,
      method,
      pathParams: pathSchema,
      query: z.object({}),
      headers: z.object({}),
      cookies: z.object({
        [policy.settings.session_cookie_name.default]: z.string().nullable().optional(),
      }),
      responses: method === 'delete' ? { 204: null } : { 200: z.array(mcpConnectionSchema) },
    },
    params: { path: pathSpecs, query: {} },
    register(app, config, db) {
      const honoPath = path.replaceAll(/\{([^}]+)\}/gu, ':$1');
      app[method](
        honoPath,
        sessionUser(config, db),
        ...(byWorkspace ? [workspaceMember(db, 'manage_members')] : []),
        async (c) => {
          const params = validateParams(
            { path: pathSpecs, query: {} },
            { path: c.req.param(), search: new URL(c.req.url).search },
          );
          const scope = {
            userId: c.get('user').id,
            ...(byWorkspace ? { workspaceId: params.path.workspace_id! } : {}),
          };
          if (method === 'delete') {
            if (!(await revokeConnection(db, params.path.grant_id ?? '', scope)))
              throw notFound('Connection');
            return c.body(null, 204);
          }
          return c.json(z.array(mcpConnectionSchema).parse(await listConnections(db, scope)));
        },
      );
    },
  };
}
export const MCP_CONNECTION_ROUTES = [
  connectionRoute(own, 'get', false),
  connectionRoute(`${own}/{grant_id}`, 'delete', false),
  connectionRoute(workspace, 'get', true),
  connectionRoute(`${workspace}/{grant_id}`, 'delete', true),
];
