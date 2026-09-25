/** Auth + workspaces + projects + prompts + providers + content query-key namespaces. */

export const authKeys = {
  all: ['auth'] as const,
  me: () => ['auth', 'me'] as const,
};

export const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => ['workspaces', 'list'] as const,
  productTour: (workspaceId: string) => ['workspaces', 'product-tour', workspaceId] as const,
  // Administrative reads. The workspace is part of the key because the
  // response IS that workspace's roster: keyed without it, switching
  // workspace would show the previous one's members until a refetch landed.
  members: (workspaceId: string) => ['workspaces', 'members', workspaceId] as const,
  invitations: (workspaceId: string) => ['workspaces', 'invitations', workspaceId] as const,
};

export const projectKeys = {
  all: ['projects'] as const,
  /**
   * Prefix over every workspace's project list. Use it to INVALIDATE from a
   * caller that has no workspace in hand; never as a query key.
   */
  lists: () => ['projects', 'list'] as const,
  /**
   * One workspace's projects.
   *
   * The workspace is part of the key because the response IS workspace-scoped
   * — the backend reads `X-Workspace-Id` to decide what to return. Keyed
   * without it, two workspaces shared one cache entry, so switching workspace
   * showed the previous one's projects until a refetch landed, and a request
   * issued for workspace A could be answered from B's payload.
   */
  list: (workspaceId: string) => ['projects', 'list', workspaceId] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
  commandCenter: (projectId: string) => ['projects', 'command-center', projectId] as const,
  brandProfile: (projectId: string) => ['projects', 'brand-profile', projectId] as const,
};

export const promptKeys = {
  all: ['prompts'] as const,
  sets: (projectId: string) => ['prompts', 'sets', projectId] as const,
  set: (promptSetId: string) => ['prompts', 'set', promptSetId] as const,
  list: (promptSetId: string) => ['prompts', 'list', promptSetId] as const,
};

export const topicKeys = {
  all: ['topics'] as const,
  list: (projectId: string) => ['topics', 'list', projectId] as const,
};

export const providerKeys = {
  all: ['providers'] as const,
  // Prefixes for workspace-agnostic invalidation (never query keys).
  allConnections: () => ['providers', 'connections'] as const,
  allStates: () => ['providers', 'states'] as const,
  // A workspace owns its provider connections, so the workspace is part of the
  // key for the same reason it is part of the project list's.
  connections: (workspaceId: string) => ['providers', 'connections', workspaceId] as const,
  connection: (connectionId: string) => ['providers', 'connection', connectionId] as const,
  catalog: () => ['providers', 'catalog'] as const,
  // The authenticated workspace projection — distinct from the public catalog.
  states: (workspaceId: string) => ['providers', 'states', workspaceId] as const,
};
