/**
 * Performance domain endpoints: the GSC-aligned dashboard projection, the six
 * dimension tables, the display-only range projection task, and the sync
 * pass-through that enqueues integrations sync runs.
 *
 * Read endpoints render persisted projections only (invariant 7 — no
 * recomputation, no provider calls). A range with no persisted snapshot comes
 * back with a null `snapshot_id` and `not_run`; the caller then queues
 * `enqueueRange` for exactly that window and polls it. Series points are
 * nullable so unavailable buckets render as chart gaps, never invented zeros.
 * Every JSON response passes through `strictValidate` (fail loud on any
 * drift). All paths are relative `/api/v1` (same-origin proxy, invariant 12).
 */
import type { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import {
  performanceDashboardSchema,
  performanceRangeTaskSchema,
  performanceTablePageSchema,
  strictValidate,
  performanceSyncEnqueueResponseSchema,
  type performanceCompareSchema,
  type performanceDimensionSchema,
  type performanceRangeSchema,
} from './schemas';
import { definedQuery, withQuery } from './shared';

export type PerformanceRange = z.infer<typeof performanceRangeSchema>;
export type PerformanceCompare = z.infer<typeof performanceCompareSchema>;
export type PerformanceDimension = z.infer<typeof performanceDimensionSchema>;
export type PerformanceDashboard = z.infer<typeof performanceDashboardSchema>;
export type PerformanceWindow = PerformanceDashboard['selected'];
export type PerformanceSeriesPoint = PerformanceWindow['series']['clicks'][number];
export type PerformanceTablePage = z.infer<typeof performanceTablePageSchema>;
export type PerformanceRangeTask = z.infer<typeof performanceRangeTaskSchema>;
export type PerformanceSyncEnqueueResponse = z.infer<typeof performanceSyncEnqueueResponseSchema>;

/** Dashboard query: the selected range, and optionally a comparison range. */
export type PerformanceDashboardParams = {
  range?: PerformanceRange;
  from?: string;
  to?: string;
  compare?: PerformanceCompare;
  compare_from?: string;
  compare_to?: string;
};

/**
 * Table query (contract C4). `snapshot_id` is the identity the dashboard
 * returned — carrying it back is what keeps a table and the chart above it
 * on the same persisted projection instead of each recomputing bounds.
 * `sort` and `page_size` are backend-validated (422 on anything outside the
 * config whitelist); the frontend never hard-codes the whitelist.
 */
export type PerformanceTableParams = {
  snapshot_id: string;
  dimension?: PerformanceDimension;
  sort?: string;
  cursor?: string;
  page_size?: number;
  compare_snapshot_id?: string;
};

export const performanceApi = {
  getDashboard: async (
    projectId: string,
    params?: PerformanceDashboardParams,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(`/projects/${projectId}/performance`, definedQuery(params));
    const res = await apiClient.get<PerformanceDashboard>(path, options);
    return strictValidate(performanceDashboardSchema, res, 'performance.getDashboard');
  },
  getTable: async (
    projectId: string,
    params: PerformanceTableParams,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(`/projects/${projectId}/performance/table`, definedQuery(params));
    const res = await apiClient.get<PerformanceTablePage>(path, options);
    return strictValidate(performanceTablePageSchema, res, 'performance.getTable');
  },
  /**
   * `POST /performance/range` — queues the display projection for one custom
   * or comparison window over already-persisted evidence. Idempotent on
   * `(project, from, to)`: asking twice returns the same task id, so the
   * client polls one identity whether it queued the work or joined a request
   * already in flight.
   */
  enqueueRange: async (
    projectId: string,
    params: { from: string; to: string },
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(`/projects/${projectId}/performance/range`, definedQuery(params));
    const res = await apiClient.post<PerformanceRangeTask>(path, undefined, options);
    return strictValidate(performanceRangeTaskSchema, res, 'performance.enqueueRange');
  },
  getRangeTask: async (projectId: string, taskId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<PerformanceRangeTask>(
      `/projects/${projectId}/performance/range/${taskId}`,
      options,
    );
    return strictValidate(performanceRangeTaskSchema, res, 'performance.getRangeTask');
  },
  /**
   * `POST /projects/{id}/performance/sync` — enqueues one integrations sync
   * run per active mapped GSC/GA4 connection (202, C3). The window is
   * INCREMENTAL server-side: it extends what the connection already covers
   * rather than re-fetching a fixed trailing window. Poll each run via
   * `integrationsApi.getSync(connection_id, sync_run_id)`.
   */
  syncNow: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<PerformanceSyncEnqueueResponse>(
      `/projects/${projectId}/performance/sync`,
      undefined,
      options,
    );
    return strictValidate(performanceSyncEnqueueResponseSchema, res, 'performance.syncNow');
  },
};
