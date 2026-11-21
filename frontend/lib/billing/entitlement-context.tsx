import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { billingQueries, type BillingUsage, type WorkspaceEntitlement } from '@/lib/api/billing';
import { AGENT_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext } from '@/lib/project/project-context';

type EntitlementContextValue = {
  entitlement: WorkspaceEntitlement | null;
  usage: BillingUsage | null;
  isLoading: boolean;
  usageIsLoading: boolean;
  usageIsError: boolean;
  hasCapability: (key: string) => boolean;
  canStartPaidWork: boolean;
  managed: boolean;
};

const FAIL_CLOSED: Omit<EntitlementContextValue, 'isLoading'> = {
  entitlement: null,
  usage: null,
  usageIsLoading: false,
  usageIsError: false,
  hasCapability: () => false,
  canStartPaidWork: false,
  managed: false,
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { activeWorkspaceId: workspaceId, activeWorkspace, status } = useProjectContext();
  const canReadBilling = activeWorkspace?.capabilities.includes('manage_billing') ?? false;
  const entitlementQuery = useQuery({
    ...billingQueries.workspaceEntitlement(workspaceId ?? ''),
    enabled: workspaceId !== null,
  });
  const usageQuery = useQuery({
    ...billingQueries.usage(workspaceId),
    enabled: canReadBilling,
  });

  const unresolved = workspaceId === null || status === 'resolving' || entitlementQuery.isLoading;

  const value = useMemo<EntitlementContextValue>(() => {
    const data = entitlementQuery.isError ? undefined : entitlementQuery.data;
    // A cached payload survives the query being disabled, so a reader who has
    // lost `manage_billing` would keep seeing the finances they may no longer
    // read. Gate on the capability, not just on the fetch.
    const usage = canReadBilling && usageQuery.data?.status === 'resolved' ? usageQuery.data : null;
    if (data?.status !== 'resolved') {
      return {
        ...FAIL_CLOSED,
        usage,
        isLoading: unresolved,
        usageIsLoading: usageQuery.isLoading,
        usageIsError: usageQuery.isError,
      };
    }
    const granted = new Map(data.capabilities.map((capability) => [capability.key, capability]));
    const hasCapability = (key: string) => {
      const capability = granted.get(key);
      if (!capability || capability.value === null) return false;
      if (capability.type === 'flag') return capability.value === true || capability.value === 1;
      if (capability.type === 'level') {
        if (typeof capability.value === 'number') return capability.value > 0;
        return (
          typeof capability.value === 'string' &&
          capability.value !== '' &&
          capability.value !== 'unset'
        );
      }
      return typeof capability.value === 'number' && capability.value > 0;
    };
    return {
      entitlement: data,
      usage,
      isLoading: unresolved,
      usageIsLoading: usageQuery.isLoading,
      usageIsError: usageQuery.isError,
      hasCapability,
      canStartPaidWork: hasCapability(AGENT_CAPABILITY),
      managed: data.credential_mode === 'funded',
    };
  }, [
    canReadBilling,
    entitlementQuery.data,
    entitlementQuery.isError,
    unresolved,
    usageQuery.data,
    usageQuery.isError,
    usageQuery.isLoading,
  ]);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlement() {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error('useEntitlement must be used within EntitlementProvider');
  return context;
}

export function useManagedPlan(): boolean {
  return useContext(EntitlementContext)?.managed ?? false;
}
