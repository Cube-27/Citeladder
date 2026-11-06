import type { Actor } from './auth/actor.ts';
import type { SessionUser } from './auth/session.ts';
import type { WorkspaceContext } from './auth/workspace.ts';
import type { Permission } from './commands/permission.ts';
import type { WorkspaceEntitlements } from './entitlements/access.ts';

/** Hono context variables every route and middleware can rely on. */
export type AppEnv = {
  Variables: {
    requestId: string;
    user: SessionUser;
    workspace: WorkspaceContext;
    /** The workspace's entitlement state, read at most once for this request. */
    entitlements: WorkspaceEntitlements;
    /** The command permission the route's gate checked, when it serves a command. */
    permission?: Permission;
    /** Set only for a public API request: the key acting for its creator. */
    actor?: Actor;
    /** The authenticated key of a public API request and its project allowlist. */
    apiKey?: { id: string; projectIds: readonly string[] | null };
    /** Set only on a token-admitted Cloud Run request (`http/origin-token.ts`). */
    publicHost?: string;
    clientIp?: string;
  };
};
