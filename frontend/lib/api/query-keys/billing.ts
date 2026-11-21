const workspacePart = (workspaceId: string | null) => workspaceId ?? 'unresolved';
const workspaceCatalogs = (workspaceId: string | null) =>
  ['billing', 'workspace-catalog', workspacePart(workspaceId)] as const;

export const billingKeys = {
  all: ['billing'] as const,
  workspaceCatalogs,
  workspaceCatalog: (workspaceId: string | null, countryCode?: string) =>
    [...workspaceCatalogs(workspaceId), countryCode ?? 'default'] as const,
  workspaceEntitlement: (workspaceId: string | null) =>
    ['billing', 'workspace-entitlement', workspacePart(workspaceId)] as const,
  entitlement: (workspaceId: string | null) =>
    ['billing', 'account-entitlement', workspacePart(workspaceId)] as const,
  usage: (workspaceId: string | null) =>
    ['billing', 'account-usage', workspacePart(workspaceId)] as const,
  invoices: (workspaceId: string | null) =>
    ['billing', 'invoices', workspacePart(workspaceId)] as const,
};
