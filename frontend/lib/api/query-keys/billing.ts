export const billingKeys = {
  all: ['billing'] as const,
  catalog: (countryCode?: string) => ['billing', 'catalog', countryCode ?? 'default'] as const,
  // Product gating is workspace-effective. The workspace id must participate in
  // the key so switching projects cannot reuse another sponsor's access fold.
  workspaceEntitlement: (workspaceId: string | null) =>
    ['billing', 'workspace-entitlement', workspaceId ?? 'unresolved'] as const,
  // Owner/Admin-private finance reads, now workspace-SCOPED endpoints: the
  // allowance they report is the one the CURRENT workspace spends against.
  // Without the workspace in the key, the usage meters could answer for one
  // workspace out of another's cached payload. Invalidate the whole `all`
  // prefix from a caller that has no workspace in hand.
  entitlement: (workspaceId: string) => ['billing', 'account-entitlement', workspaceId] as const,
  usage: (workspaceId: string) => ['billing', 'account-usage', workspaceId] as const,
};
