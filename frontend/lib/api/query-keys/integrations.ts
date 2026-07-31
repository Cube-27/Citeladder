/**
 * Integrations query-key namespace (F1) — connections are a flat
 * workspace-scoped route (scoped by the `X-Workspace-Id` header, like
 * entitlements), so the workspace id participates in the connections key;
 * sync runs are isolated per connection.
 */
export const integrationKeys = {
  all: ['integrations'] as const,
  connections: (workspaceId: string | null) =>
    ['integrations', 'connections', workspaceId ?? 'default'] as const,
  syncs: (connectionId: string) => ['integrations', 'syncs', connectionId] as const,
  sync: (connectionId: string, syncId: string) =>
    ['integrations', 'sync', connectionId, syncId] as const,
  // Property discovery hits the provider live, so it is fetched lazily (only
  // once the picker opens) and cached per connection rather than with the
  // connections list.
  properties: (connectionId: string) => ['integrations', 'properties', connectionId] as const,
  mappings: (connectionId: string) => ['integrations', 'mappings', connectionId] as const,
};
