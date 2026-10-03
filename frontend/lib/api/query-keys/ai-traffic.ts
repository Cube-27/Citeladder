/**
 * AI Referrals query-key namespace — isolated by project; every requested
 * window and granularity participates in the key.
 */
import type { ListFilters } from './shared';

export const aiTrafficKeys = {
  all: ['ai-traffic'] as const,
  view: (workspaceId: string, projectId: string, view: string, filters: ListFilters = {}) =>
    ['ai-traffic', workspaceId, projectId, view, filters] as const,
  dashboard: (projectId: string, filters: ListFilters = {}) =>
    ['ai-traffic', 'dashboard', projectId, filters] as const,
};
