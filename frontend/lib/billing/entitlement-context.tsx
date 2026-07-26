'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { billingApi, type WorkspaceEntitlement } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext } from '@/lib/project/project-context';

type EntitlementContextValue = {
  entitlement: WorkspaceEntitlement | null;
  isLoading: boolean;
  canStartPaidWork: boolean;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

/** Workspace sponsorship resolver. UI hints never replace backend enforcement. */
export function EntitlementProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { activeProject } = useProjectContext();
  const workspaceId = activeProject?.workspace_id ?? null;
  const query = useQuery({
    queryKey: queryKeys.billing.entitlement(workspaceId),
    queryFn: ({ signal }) => billingApi.entitlement(workspaceId!, { signal }),
    enabled: Boolean(workspaceId),
  });
  const value = useMemo<EntitlementContextValue>(
    () => ({
      entitlement: query.data ?? null,
      isLoading: query.isLoading,
      // Fail closed when no verified entitlement has loaded. React Query keeps
      // the last successful value through transient refetch failures.
      canStartPaidWork: query.data?.tier_key === 'paid',
    }),
    [query.data, query.isLoading],
  );
  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error('useEntitlement must be used within EntitlementProvider');
  return context;
}
