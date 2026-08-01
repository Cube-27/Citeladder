export const billingKeys = {
  all: ['billing'] as const,
  catalog: (countryCode?: string) => ['billing', 'catalog', countryCode ?? 'default'] as const,
  // Account-scoped, not workspace-scoped: the entitlement fold and the usage
  // ledger belong to the billing account behind the workspace.
  entitlement: () => ['billing', 'entitlement'] as const,
  usage: () => ['billing', 'usage'] as const,
};
