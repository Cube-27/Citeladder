import { useQuery } from '@tanstack/react-query';

import type { ProjectMarket } from '@citeladder/contracts/markets';

import { projectQueries } from '@/lib/api/projects';

const NONE: readonly ProjectMarket[] = [];

export type ProjectMarkets =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'loaded'; markets: readonly ProjectMarket[] }>;

export function useProjectMarketsState(
  projectId: string,
  workspaceId: string | null,
  enabled = true,
): ProjectMarkets {
  const query = useQuery({
    ...projectQueries.markets({ workspaceId, projectId }),
    enabled: enabled && Boolean(projectId && workspaceId),
  });
  if (query.isLoading) return { kind: 'pending' };
  return { kind: 'loaded', markets: query.data ?? NONE };
}

export function useProjectMarkets(
  projectId: string,
  workspaceId: string | null,
  enabled = true,
): readonly ProjectMarket[] {
  const state = useProjectMarketsState(projectId, workspaceId, enabled);
  return state.kind === 'loaded' ? state.markets : NONE;
}
