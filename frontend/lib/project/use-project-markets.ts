import { useQuery } from '@tanstack/react-query';

import type { ProjectMarket } from '@citeladder/contracts/markets';

import type { RetryableRead } from '@/components/ui/notice';
import { projectQueries } from '@/lib/api/projects';

const NONE: readonly ProjectMarket[] = [];

export type ProjectMarkets =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'failed'; read: RetryableRead }>
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
  if (query.isError) return { kind: 'failed', read: query };
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
