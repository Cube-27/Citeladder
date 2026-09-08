export const billingKeys = {
  all: ['billing'] as const,
  catalog: (countryCode?: string) => ['billing', 'catalog', countryCode ?? 'default'] as const,
  // Product gating is workspace-effective. The workspace id must participate in
  // the key so switching projects cannot reuse another sponsor's access fold.
  workspaceEntitlement: (workspaceId: string | null) =>
    ['billing', 'workspace-entitlement', workspaceId ?? 'unresolved'] as const,
  // Owner-private finance reads stay account-scoped and are used only by Billing Settings.
  entitlement: () => ['billing', 'account-entitlement'] as const,
  usage: () => ['billing', 'account-usage'] as const,
};
