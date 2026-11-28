import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { prefetchRoute } from '@/lib/navigation/route-prefetch';
import { useNavScope } from '@/lib/project/project-context';

export function useRouteIntent() {
  const queryClient = useQueryClient();
  const { activeProject } = useNavScope();
  return useCallback(
    (href: string) =>
      prefetchRoute(
        queryClient,
        href,
        activeProject
          ? { projectId: activeProject.id, workspaceId: activeProject.workspace_id }
          : null,
      ),
    [activeProject, queryClient],
  );
}
