/**
 * Attribution domain endpoints (commerce): the persisted A1/A2 attribution
 * snapshot projection plus the recompute enqueue/status pair.
 *
 * Owns transport for the attribution slice. The snapshot read serves
 * persisted `AttributionSnapshot` rows only (invariant 7 — no provider call,
 * no read-time recomputation; an absent snapshot yields the empty contract,
 * never a 404). A1 and A2 are cross-checks partitioned by ISO currency: the
 * payload is consumed verbatim, never summed or converted client-side. Every
 * JSON response passes through `strictValidate` (fail loud on any drift).
 * All paths are relative `/api/v1` (same-origin proxy, invariant 12).
 */
import { apiClient, type ApiRequestOptions } from './client';
import {
  attributionRecomputeSchema,
  attributionSnapshotSchema,
  strictValidate,
} from './schemas';
import { definedQuery, withQuery } from './shared';
import type { AttributionRecompute, AttributionSnapshot } from './types';
import type { SnapshotGranularity } from './traffic';

/** Snapshot window query (`from`/`to` ISO dates + bucket granularity). */
export type AttributionSnapshotParams = {
  from?: string;
  to?: string;
  granularity?: SnapshotGranularity;
};

export const attributionApi = {
  /**
   * `GET /projects/{id}/commerce/attribution` — the snapshot matching
   * `(from, to, granularity)`, or the project's latest persisted snapshot at
   * the granularity when the window is omitted.
   */
  getSnapshot: async (
    projectId: string,
    params?: AttributionSnapshotParams,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(
      `/projects/${projectId}/commerce/attribution`,
      definedQuery(params),
    );
    const res = await apiClient.get<AttributionSnapshot>(path, options);
    return strictValidate(attributionSnapshotSchema, res, 'attribution.getSnapshot');
  },
  /** `POST /projects/{id}/commerce/attribution/recompute` (202 enqueue). */
  recompute: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<AttributionRecompute>(
      `/projects/${projectId}/commerce/attribution/recompute`,
      undefined,
      options,
    );
    return strictValidate(attributionRecomputeSchema, res, 'attribution.recompute');
  },
  /** `GET /projects/{id}/commerce/attribution/recompute/{task_id}` — polled until terminal. */
  getRecompute: async (projectId: string, taskId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<AttributionRecompute>(
      `/projects/${projectId}/commerce/attribution/recompute/${taskId}`,
      options,
    );
    return strictValidate(attributionRecomputeSchema, res, 'attribution.getRecompute');
  },
};
