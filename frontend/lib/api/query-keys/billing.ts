/**
 * Billing query-key namespace. Every read is workspace-level, so the
 * workspace is part of each key; a commercial write refreshes `billing.all`.
 */
const workspacePart = (workspaceId: string | null) => workspaceId ?? 'unresolved';
/** Every country's catalog for one workspace: the rows a country change may keep. */
const workspaceCatalogs = (workspaceId: string | null) =>
  ['billing', 'workspace-catalog', workspacePart(workspaceId)] as const;

export const billingKeys = {
  all: ['billing'] as const,
  // What one workspace may buy; it stays readable when the workspace's access has ended.
  workspaceCatalogs,
  workspaceCatalog: (workspaceId: string | null, countryCode?: string) =>
    [...workspaceCatalogs(workspaceId), countryCode ?? 'default'] as const,
  // Product gating is workspace-effective. The workspace id must participate in
  // the key so switching projects cannot reuse another sponsor's access fold.
  workspaceEntitlement: (workspaceId: string | null) =>
    ['billing', 'workspace-entitlement', workspacePart(workspaceId)] as const,
  // Owner/Admin-private finance reads, now workspace-SCOPED endpoints: the
  // allowance they report is the one the CURRENT workspace spends against.
  // Without the workspace in the key, the usage meters could answer for one
  // workspace out of another's cached payload. Invalidate the whole `all`
  // prefix from a caller that has no workspace in hand.
  entitlement: (workspaceId: string | null) =>
    ['billing', 'account-entitlement', workspacePart(workspaceId)] as const,
  usage: (workspaceId: string | null) =>
    ['billing', 'account-usage', workspacePart(workspaceId)] as const,
  invoices: (workspaceId: string | null) =>
    ['billing', 'invoices', workspacePart(workspaceId)] as const,
};
