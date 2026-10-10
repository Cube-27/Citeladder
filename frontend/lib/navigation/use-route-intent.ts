'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { preloadRouteChunk } from '@/lib/navigation/route-chunks';
import { prefetchRoute } from '@/lib/navigation/route-prefetch';
import { useProjectContext } from '@/lib/project/project-context';

/** Warm a destination's code and primary read on pointer or keyboard intent. */
export function useRouteIntent() {
  const queryClient = useQueryClient();
  const { activeProject } = useProjectContext();
  return useCallback(
    (href: string) => {
      preloadRouteChunk(href);
      return prefetchRoute(
        queryClient,
        href,
        activeProject
          ? { projectId: activeProject.id, workspaceId: activeProject.workspace_id }
          : null,
      );
    },
    [activeProject, queryClient],
  );
}
