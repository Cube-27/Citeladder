import type { ApiKeyScope } from '@citeladder/contracts/api-keys';
import type { Context } from 'hono';

import type { AppEnv } from '../context.ts';
import { capabilityDenied, roleAllows, type WorkspaceCapability } from './workspace.ts';

export type Actor = {
  kind: 'member' | 'api_key' | 'mcp';
  workspaceId: string;
  userId: string;
  role: string;
  scopes: ReadonlySet<ApiKeyScope> | 'all';
};

export function requireCapability(
  actor: Actor,
  capability: WorkspaceCapability,
  scope?: ApiKeyScope,
): void {
  if (!roleAllows(actor.role, capability)) throw capabilityDenied(capability);
  if (actor.scopes === 'all') return;
  if (scope === undefined || !actor.scopes.has(scope))
    throw capabilityDenied(
      capability,
      scope === undefined
        ? 'API keys cannot perform this operation'
        : `This API key does not hold the ${scope} scope`,
    );
}

export function requestProjectOf(c: Context<AppEnv>): string | null {
  return c.get('workspace').projectId;
}

export function actorOf(c: Context<AppEnv>): Actor {
  const actor = c.get('actor');
  if (actor) return actor;
  const workspace = c.get('workspace');
  return {
    kind: 'member',
    workspaceId: workspace.workspaceId,
    userId: c.get('user').id,
    role: workspace.role,
    scopes: 'all',
  };
}
