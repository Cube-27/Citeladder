/** Commerce (catalog feed health) query-key namespace. */
export const commerceKeys = {
  all: ['commerce'] as const,
  catalogHealth: (projectId: string) => ['commerce', 'catalog-health', projectId] as const,
  discoveryRuns: (projectId: string) => ['commerce', 'discovery-runs', projectId] as const,
  discoveryCandidates: (projectId: string, runId?: string) =>
    ['commerce', 'discovery-candidates', projectId, runId ?? 'all'] as const,
  comparisons: (projectId: string) => ['commerce', 'comparisons', projectId] as const,
};
