import type { SessionUser } from './auth/session.ts';
import type { WorkspaceContext } from './auth/workspace.ts';

/** Hono context variables every route and middleware can rely on. */
export type AppEnv = {
  Variables: {
    requestId: string;
    user: SessionUser;
    workspace: WorkspaceContext;
  };
};
