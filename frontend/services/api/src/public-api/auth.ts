/**
 * Public API authentication: `Authorization: Bearer cl_live_…` only. Cookies
 * and `X-Workspace-Id` are never read.
 *
 * A request passes, in order: the key (401 `invalid_api_key`), the per-key
 * and per-workspace rate limits (429), the creator's live membership, the
 * workspace's access and `api_access` grant (403), the operation's capability
 * from the creator's live role intersected with the key's scope (403), then
 * the path project and its owned IDs (404 outside the workspace, the key's
 * allowlist or the project).
 */
import { apiKeyScopeSchema, type ApiKeyScope } from '@citeladder/contracts/api-keys';
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import type { MiddlewareHandler } from 'hono';

import { enforceSubjectRequest } from '../abuse/usage.ts';
import { authenticateApiKey, touchApiKey } from '../api-keys/keys.ts';
import { requireCapability, type Actor } from '../auth/actor.ts';
import { WorkspaceContext, type WorkspaceCapability } from '../auth/workspace.ts';
import { policy, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { requireWorkspaceAccess } from '../entitlements/access.ts';
import { hasGrantedFlag } from '../entitlements/occupancy.ts';
import { ApiError, notFound } from '../errors.ts';
import { RequestValidationError, UUID_MESSAGE } from '../http/params.ts';
import { parseUuid } from '../http/uuid.ts';
import { requirePathOwnership } from './ownership.ts';

const P = policy.public_api;

function limit(subject: keyof typeof P.rate_limits) {
  const { operation, limit: allowed, window_seconds: windowSeconds } = P.rate_limits[subject];
  return { operation, limit: allowed, windowSeconds };
}

export function apiKeyAuth(
  db: Database,
  config: ServiceConfig,
  operation: { capability: WorkspaceCapability; scope: ApiKeyScope },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = await authenticateApiKey(
      db,
      config.auth.apiKeyPepper,
      c.req.header('authorization'),
    );
    await enforceSubjectRequest(db, 'api_key', key.id, limit('api_key'));
    await enforceSubjectRequest(db, 'workspace', key.workspace_id, limit('workspace'));
    const member = await db
      .selectFrom('workspace_members')
      .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
      .select('workspace_members.role')
      .where('workspace_members.workspace_id', '=', key.workspace_id)
      .where('workspace_members.user_id', '=', key.created_by_user_id)
      .where('workspaces.is_system', '=', false)
      .executeTakeFirst();
    if (member === undefined)
      throw new ApiError(401, 'This API key no longer has workspace access', {
        code: asApiErrorCode(P.codes.invalid_api_key),
      });
    await requireWorkspaceAccess(db, key.workspace_id);
    if (!(await hasGrantedFlag(db, key.workspace_id, policy.entitlements.api_access)))
      throw new ApiError(403, "API access is not included in this workspace's plan", {
        code: asApiErrorCode(P.codes.api_access_not_in_plan),
      });
    const actor: Actor = {
      kind: 'api_key',
      workspaceId: key.workspace_id,
      userId: key.created_by_user_id,
      role: member.role,
      scopes: new Set(
        key.scopes.flatMap((scope) => {
          const parsed = apiKeyScopeSchema.safeParse(scope);
          return parsed.success ? [parsed.data] : [];
        }),
      ),
    };
    requireCapability(actor, operation.capability, operation.scope);
    const projectId = await pathProject(db, c.req.param('project_id'), key);
    if (projectId !== null)
      await requirePathOwnership(db, key.workspace_id, projectId, c.req.param());
    c.set('actor', actor);
    c.set('apiKey', { id: key.id, projectIds: key.project_ids });
    c.set('workspace', new WorkspaceContext(key.workspace_id, member.role, projectId));
    await touchApiKey(db, key);
    await next();
  };
}

/** The path's project, which must be in the key's workspace and allowlist (else 404). */
async function pathProject(
  db: Database,
  raw: string | undefined,
  key: { workspace_id: string; project_ids: string[] | null },
): Promise<string | null> {
  if (raw === undefined) return null;
  const projectId = parseUuid(raw);
  if (projectId === null)
    throw new RequestValidationError([
      { loc: ['project_id'], message: UUID_MESSAGE, type: 'uuid_parsing' },
    ]);
  if (key.project_ids !== null && !key.project_ids.includes(projectId)) throw notFound('Project');
  const project = await db
    .selectFrom('projects')
    .select('id')
    .where('id', '=', projectId)
    .where('workspace_id', '=', key.workspace_id)
    .executeTakeFirst();
  if (project === undefined) throw notFound('Project');
  return projectId;
}
