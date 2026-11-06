import { useQuery } from '@tanstack/react-query';

import { billingQueries } from '@/lib/api/billing';

/** The plans this workspace may buy, priced for a two-letter country once one is entered. */
export function useWorkspaceCatalog(workspaceId: string | null, country: string) {
  return useQuery(
    billingQueries.workspaceCatalog(workspaceId, country.length === 2 ? country : undefined),
  );
}
