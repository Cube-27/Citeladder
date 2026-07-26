/** Attribution (commerce A1/A2 snapshot + recompute) query-key namespace. */
import type { ListFilters } from './shared';

export const attributionKeys = {
  all: ['attribution'] as const,
  // The window/granularity filters participate so switching a control
  // re-derives the view (normalized to null for a stable cache entry).
  snapshot: (projectId: string, filters: ListFilters = {}) =>
    ['attribution', 'snapshot', projectId, filters] as const,
  recompute: (projectId: string, taskId: string) =>
    ['attribution', 'recompute', projectId, taskId] as const,
};
