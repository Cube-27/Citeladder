'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { billingApi, type BillingEntitlement, type BillingUsage } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';

type EntitlementContextValue = {
  entitlement: BillingEntitlement | null;
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
  const entitlementQuery = useQuery({
    queryKey: queryKeys.billing.entitlement(),
    queryFn: ({ signal }) => billingApi.entitlement({ signal }),
  });
  const usageQuery = useQuery({
    queryKey: queryKeys.billing.usage(),
    queryFn: ({ signal }) => billingApi.usage({ signal }),
  });

  const value = useMemo<EntitlementContextValue>(() => {
    const data = entitlementQuery.data;
    if (!data || data.status !== 'resolved') {
      return {
        ...FAIL_CLOSED,
        isLoading: entitlementQuery.isLoading,
        usageIsLoading: usageQuery.isLoading,
        usageIsError: usageQuery.isError,
      };
    }
    const granted = new Map(data.capabilities.map((c) => [c.key, c.value]));
    const hasCapability = (key: string) => {
      const value = granted.get(key);
      if (value === undefined || value === null) return false;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value > 0;
      return value !== '';
    };
    return {
      entitlement: data,
      usage: usageQuery.data?.status === 'resolved' ? usageQuery.data : null,
      isLoading: entitlementQuery.isLoading,
      usageIsLoading: usageQuery.isLoading,
      usageIsError: usageQuery.isError,
      hasCapability,
      // A live base subscription is what funds paid work. `grants` proves it
      // was actually issued; a pending checkout grants nothing.
      canStartPaidWork: data.grants.some(
        (grant) => grant.source_kind === 'plan' && grant.revoked_at === null,
      ),
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
