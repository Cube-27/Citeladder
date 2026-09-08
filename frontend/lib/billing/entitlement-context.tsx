'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { billingApi, type BillingUsage, type WorkspaceEntitlement } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { CONTENT_CREATION_CAPABILITY, GROWTH_AGENT_CAPABILITY } from '@/lib/config/billing';
import { useActiveProject } from '@/lib/project/project-context';

const PAID_WORK_CAPABILITIES = new Set([CONTENT_CREATION_CAPABILITY, GROWTH_AGENT_CAPABILITY]);

type EntitlementContextValue = {
  entitlement: WorkspaceEntitlement | null;
  usage: BillingUsage | null;
  isLoading: boolean;
  usageIsLoading: boolean;
  usageIsError: boolean;
  /**
   * Whether one capability is granted. Derived from the resolved capability
   * fold — NEVER from a tier name. A tier is a purchase, a capability is what
   * that purchase actually granted, and only the latter may gate UI.
   */
  hasCapability: (key: string) => boolean;
  canStartPaidWork: boolean;
};

const FAIL_CLOSED: Omit<EntitlementContextValue, 'isLoading'> = {
  entitlement: null,
  usage: null,
  usageIsLoading: false,
  usageIsError: false,
  hasCapability: () => false,
  canStartPaidWork: false,
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

/**
 * Account entitlement resolver. UI hints never replace backend enforcement.
 *
 * Fails closed in every non-resolved state — loading, strict-parse error, and
 * `entitlement_unresolved` all yield a null entitlement and no capabilities.
 * An unresolved entitlement is an explicit backend state, not a transport
 * failure, and it must not read as "allowed".
 */
export function EntitlementProvider({ children }: Readonly<{ children: ReactNode }>) {
  const activeProject = useActiveProject();
  const workspaceId = activeProject?.workspace_id ?? null;
  const entitlementQuery = useQuery({
    queryKey: queryKeys.billing.workspaceEntitlement(workspaceId),
    queryFn: ({ signal }) => billingApi.workspaceEntitlement(workspaceId!, { signal }),
    enabled: workspaceId !== null,
  });
  const usageQuery = useQuery({
    queryKey: queryKeys.billing.usage(),
    queryFn: ({ signal }) => billingApi.usage({ signal }),
  });

  const value = useMemo<EntitlementContextValue>(() => {
    const data = entitlementQuery.data;
    const usage = usageQuery.data?.status === 'resolved' ? usageQuery.data : null;
    if (!data || data.status !== 'resolved') {
      return {
        ...FAIL_CLOSED,
        // Account usage is independently authoritative. A new account has a
        // workspace but no active project yet, so the workspace entitlement
        // query is intentionally disabled during first-project onboarding.
        usage,
        isLoading: entitlementQuery.isLoading,
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
      isLoading: entitlementQuery.isLoading,
      usageIsLoading: usageQuery.isLoading,
      usageIsError: usageQuery.isError,
      hasCapability,
      // Product controls follow effective capability authority, not a plan name
      // or historical grant kind. Backend admission remains authoritative.
      canStartPaidWork: [...PAID_WORK_CAPABILITIES].some(hasCapability),
    };
  }, [
    entitlementQuery.data,
    entitlementQuery.isLoading,
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

export function capabilityRemaining(usage: BillingUsage | null, key: string): number | undefined {
  if (!usage || usage.status !== 'resolved') return undefined;
  const item = usage.items.find((candidate) => candidate.key === key);
  return typeof item?.remaining === 'number' ? item.remaining : undefined;
}
