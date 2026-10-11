import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { billingApi } from '@/lib/api/billing';
import { queryKeys } from '@/lib/api/query-keys';

/**
 * The plans this workspace may buy: checkout opens only where the server says
 * so (B2), the same signal that hides prices on the public pricing page.
 */
export function useWorkspaceCatalog(workspaceId: string | null, country: string) {
  const code = country.length === 2 ? country : undefined;
  return useQuery({
    queryKey: queryKeys.billing.workspaceCatalog(workspaceId, code),
    queryFn: ({ signal }) => billingApi.workspaceCatalog(code, { signal, workspaceId }),
    enabled: workspaceId !== null,
    placeholderData: keepPreviousData,
  });
}
