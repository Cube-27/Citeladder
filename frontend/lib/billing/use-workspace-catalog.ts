import { useQuery } from '@tanstack/react-query';

import { billingQueries } from '@/lib/api/billing';

export function useWorkspaceCatalog(workspaceId: string | null, country: string) {
  return useQuery(
    billingQueries.workspaceCatalog(workspaceId, country.length === 2 ? country : undefined),
  );
}
