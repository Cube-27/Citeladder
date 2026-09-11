'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { billingApi, type BillingUsage, type WorkspaceEntitlement } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';
import { CONTENT_CREATION_CAPABILITY, GROWTH_AGENT_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext } from '@/lib/project/project-context';

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
  // The WORKSPACE, not the active project. Deriving it from a project made
  // entitlements unanswerable in exactly the workspace that needs them most:
  // one with no project yet, where the reader is about to be told whether
  // they may create one.
  const { activeWorkspaceId: workspaceId, activeWorkspace, status } = useProjectContext();
  // Private finance reads are Owner/Admin only on the server. Asking for them
  // as a Member or Viewer would be a guaranteed 403, so the query is simply
  // not issued — the member-safe allowance hints on the workspace entitlement
  // cover what the shell actually needs.
  const canReadBilling = activeWorkspace?.capabilities.includes('manage_billing') ?? false;
  const entitlementQuery = useQuery({
    queryKey: queryKeys.billing.workspaceEntitlement(workspaceId),
    queryFn: ({ signal }) =>
      billingApi.workspaceEntitlement(String(workspaceId), { signal, workspaceId }),
    enabled: workspaceId !== null,
  });
  const usageQuery = useQuery({
    queryKey: queryKeys.billing.usage(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) => billingApi.usage({ signal, workspaceId }),
    enabled: workspaceId !== null && canReadBilling,
  });

  /**
   * Not yet answerable, which is not the same as answered "no".
   *
   * Until the workspace resolves, the entitlement query has nothing to ask
   * about and sits DISABLED — and a disabled query is not `isLoading`.
   * Reading that alone reported a settled "no capabilities" during the
   * busiest moment of a cold start, and the shell drew itself without the
   * controls it was about to gain.
   */
  const unresolved = workspaceId === null || status === 'resolving' || entitlementQuery.isLoading;

  const value = useMemo<EntitlementContextValue>(() => {
    const data = entitlementQuery.data;
    // A cached payload survives the query being disabled, so a reader who has
    // lost `manage_billing` would keep seeing the finances they may no longer
    // read. Gate on the capability, not just on the fetch.
    const usage = canReadBilling && usageQuery.data?.status === 'resolved' ? usageQuery.data : null;
    if (!data || data.status !== 'resolved') {
      return {
        ...FAIL_CLOSED,
        // Account usage is independently authoritative: the allowance a new
        // workspace spends against is answerable before it owns any project,
        // which is what the first-project flow asks about.
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
      // Product controls follow effective capability authority, not a plan name
      // or historical grant kind. Backend admission remains authoritative.
      canStartPaidWork: [...PAID_WORK_CAPABILITIES].some(hasCapability),
    };
  }, [
    canReadBilling,
    entitlementQuery.data,
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

/**
 * How much of one occupancy allowance is left in the active workspace.
 *
 * Reads the MEMBER-SAFE hints on the workspace entitlement rather than the
 * owner-private usage report, so a Member sees the same "no slots left" state
 * an Owner does without being shown the workspace's finances. `undefined`
 * means "not answerable yet", which is not the same as zero — callers must
 * not treat it as a denial.
 */
export function capabilityRemaining(
  entitlement: WorkspaceEntitlement | null,
  key: string,
): number | undefined {
  if (!entitlement || entitlement.status !== 'resolved') return undefined;
  const hint = entitlement.occupancy.find((candidate) => candidate.key === key);
  return hint?.remaining;
}
