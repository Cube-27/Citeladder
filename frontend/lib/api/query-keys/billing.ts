export const billingKeys = {
  all: ['billing'] as const,
  me: () => ['billing', 'me'] as const,
  catalog: (countryCode?: string) => ['billing', 'catalog', countryCode ?? 'default'] as const,
  entitlement: (workspaceId: string | null) =>
    ['billing', 'entitlement', workspaceId ?? 'default'] as const,
};
