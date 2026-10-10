import type { QueryClient } from '@tanstack/react-query';

import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';

/**
 * Look up brand and competitor logos after a write that set or changed the
 * project's domains: creation and a project edit. Opening the app never
 * fetches logos. The API answers from its own cache (negative entries
 * included) and rate-limits the lookup, so a repeat is cheap; a failure leaves
 * the initials fallback and is not retried.
 */
export function refreshBrandLogos(
  queryClient: QueryClient,
  projectId: string,
  workspaceId: string,
): void {
  void projectsApi
    .refreshProjectLogos(projectId, { workspaceId })
    .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }))
    .catch(() => undefined);
}
