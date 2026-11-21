const connection = <const Resource extends string>(connectionId: string, resource: Resource) =>
  ['integrations', 'connection', connectionId, resource] as const;

export const integrationKeys = {
  all: ['integrations'] as const,
  connections: (workspaceId: string | null) =>
    ['integrations', 'connections', workspaceId] as const,
  backfillProgress: (workspaceId: string | null, connectionId: string) =>
    [...connection(connectionId, 'backfill-progress'), workspaceId] as const,
  sync: (workspaceId: string | null, connectionId: string, syncId: string) =>
    [...connection(connectionId, 'sync'), syncId, workspaceId] as const,
  mappings: (workspaceId: string | null, connectionId: string) =>
    [...connection(connectionId, 'mappings'), workspaceId] as const,
};
