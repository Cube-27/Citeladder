/**
 * Workspace membership and the role/capability matrix.
 *
 * Native workspace config owns the matrix and refusal wording; a role
 * missing from it confers nothing (fail closed).
 * A non-member cannot tell an existing workspace from a missing one: both 404.
 */
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import type { MiddlewareHandler } from 'hono';

import { policy } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { ApiError, notFound } from '../errors.ts';
import { RequestValidationError, UUID_MESSAGE } from '../http/params.ts';
import { parseUuid } from '../http/uuid.ts';

export type WorkspaceCapability = keyof typeof policy.workspaces.denial_messages;

const ROLE_CAPABILITIES: Record<string, readonly string[]> = policy.workspaces.roles;
const FORBIDDEN_CODE = asApiErrorCode(policy.workspaces.forbidden_code);

function roleCapabilities(role: string): readonly string[] {
  return (Object.hasOwn(ROLE_CAPABILITIES, role) && ROLE_CAPABILITIES[role]) || [];
}

export class WorkspaceContext {
  readonly scope: WorkspaceScope;
  readonly role: string;

  constructor(workspaceId: string, role: string) {
    this.scope = new WorkspaceScope(workspaceId);
    this.role = role;
  }

  get workspaceId(): string {
    return this.scope.workspaceId;
  }

  allows(capability: WorkspaceCapability): boolean {
    return roleCapabilities(this.role).includes(capability);
  }

  /** The caller's effective capability names for UI controls. */
  capabilities(): readonly string[] {
    return roleCapabilities(this.role);
  }

  /** 403 unless the caller's role permits `capability`. */
  require(capability: WorkspaceCapability): void {
    if (!this.allows(capability)) {
      throw new ApiError(403, policy.workspaces.denial_messages[capability], {
        code: FORBIDDEN_CODE,
      });
    }
  }
}

/** The caller's membership, or 404; system workspaces never authorize. */
export async function resolveWorkspaceMember(
  db: Database,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceContext> {
  const member = await db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select(['workspace_members.workspace_id', 'workspace_members.role'])
    .where('workspace_members.workspace_id', '=', workspaceId)
    .where('workspace_members.user_id', '=', userId)
    .where('workspaces.is_system', '=', false)
    .executeTakeFirst();
  if (member === undefined) throw notFound('Workspace');
  return new WorkspaceContext(member.workspace_id, member.role);
}

/**
 * Authorize the path `:workspace_id` for the session user (mount after
 * `sessionUser`), optionally gated on one capability.
 */
export function workspaceMember(
  db: Database,
  capability?: WorkspaceCapability,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const workspaceId = parseUuid(c.req.param('workspace_id') ?? '');
    if (workspaceId === null) {
      throw new RequestValidationError([
        { loc: ['workspace_id'], message: UUID_MESSAGE, type: 'uuid_parsing' },
      ]);
    }
    const workspace = await resolveWorkspaceMember(db, c.get('user').id, workspaceId);
    if (capability !== undefined) workspace.require(capability);
    c.set('workspace', workspace);
    await next();
  };
}

/**
 * Authorize through the project in the path (mount after `sessionUser`): the
 * caller must belong to the project's workspace. Mirrors
 * `require_project_member`; a missing project and a foreign one are the same
 * `Project not found`, and `X-Workspace-Id` is not read.
 */
export function projectMember(db: Database): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const projectId = parseUuid(c.req.param('project_id') ?? '');
    if (projectId === null) {
      throw new RequestValidationError([
        { loc: ['project_id'], message: UUID_MESSAGE, type: 'uuid_parsing' },
      ]);
    }
    const member = await db
      .selectFrom('projects')
      .innerJoin('workspaces', 'workspaces.id', 'projects.workspace_id')
      .innerJoin('workspace_members', 'workspace_members.workspace_id', 'projects.workspace_id')
      .select(['workspace_members.workspace_id', 'workspace_members.role'])
      .where('projects.id', '=', projectId)
      .where('workspace_members.user_id', '=', c.get('user').id)
      .where('workspaces.is_system', '=', false)
      .executeTakeFirst();
    if (member === undefined) throw notFound('Project');
    c.set('workspace', new WorkspaceContext(member.workspace_id, member.role));
    await next();
  };
}

/** The caller's earliest tenant membership, or 404. */
async function defaultWorkspaceMember(db: Database, userId: string): Promise<WorkspaceContext> {
  const member = await db
    .selectFrom('workspace_members')
    .innerJoin('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
    .select(['workspace_members.workspace_id', 'workspace_members.role'])
    .where('workspace_members.user_id', '=', userId)
    .where('workspaces.is_system', '=', false)
    .orderBy('workspace_members.created_at', 'asc')
    .limit(1)
    .executeTakeFirst();
  if (member === undefined) throw notFound('Workspace');
  return new WorkspaceContext(member.workspace_id, member.role);
}

/**
 * Resolve the active workspace for a flat route (mount after `sessionUser`):
 * the `X-Workspace-Id` header when the client selects one, otherwise the
 * caller's earliest tenant membership. Mirrors `require_active_workspace`;
 * membership is verified either way, and a foreign workspace is a 404.
 */
export function activeWorkspace(
  db: Database,
  capability?: WorkspaceCapability,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const selected = c.req.header('x-workspace-id');
    let workspace: WorkspaceContext;
    if (selected) {
      const workspaceId = parseUuid(selected);
      if (workspaceId === null) throw new ApiError(400, 'Invalid X-Workspace-Id');
      workspace = await resolveWorkspaceMember(db, c.get('user').id, workspaceId);
    } else {
      workspace = await defaultWorkspaceMember(db, c.get('user').id);
    }
    if (capability !== undefined) workspace.require(capability);
    c.set('workspace', workspace);
    await next();
  };
}
