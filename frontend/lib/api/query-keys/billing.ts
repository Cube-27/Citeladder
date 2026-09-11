export const billingKeys = {
  all: ['billing'] as const,
  catalog: (countryCode?: string) => ['billing', 'catalog', countryCode ?? 'default'] as const,
  // Product gating is workspace-effective. The workspace id must participate in
  // the key so switching projects cannot reuse another sponsor's access fold.
  workspaceEntitlement: (workspaceId: string | null) =>
    ['billing', 'workspace-entitlement', workspaceId ?? 'unresolved'] as const,
  // Owner-private finance reads. The workspace participates in the key because
  // the allowance these report is the one the CURRENT workspace spends against
  // (Phase 2 makes the endpoints themselves workspace-scoped); without it, the
  // onboarding allowance check and the usage meters could answer for one
  // workspace out of another's cached payload.
  allEntitlement: () => ['billing', 'account-entitlement'] as const,
  allUsage: () => ['billing', 'account-usage'] as const,
  entitlement: (workspaceId: string) => ['billing', 'account-entitlement', workspaceId] as const,
  usage: (workspaceId: string) => ['billing', 'account-usage', workspaceId] as const,
};
