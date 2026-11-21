import type { Actor } from './auth/actor.ts';
import type { SessionUser } from './auth/session.ts';
import type { WorkspaceContext } from './auth/workspace.ts';
import type { Permission } from './commands/permission.ts';
import type { WorkspaceEntitlements } from './entitlements/access.ts';

export type AppEnv = {
  Variables: {
    requestId: string;
    user: SessionUser;
    workspace: WorkspaceContext;
    entitlements: WorkspaceEntitlements;
    permission?: Permission;
    actor?: Actor;
    apiKey?: { id: string; projectIds: readonly string[] | null };
    publicHost?: string;
    clientIp?: string;
  };
};
