/**
 * Commerce domain endpoints (catalog feed health): the project-scoped
 * catalog-health projection joining the workspace's feed connections (e.g.
 * Shopify) to per-SKU feed status and the current-or-latest sync summary.
 *
 * Owns transport for the commerce slice. Reads serve persisted projections
 * only (invariant 7 — no provider call, no recomputation); every JSON
 * response passes through `strictValidate` (fail loud on any drift). All
 * paths are relative `/api/v1` (same-origin proxy, invariant 12).
 */
import { apiClient, type ApiRequestOptions } from './client';
import { commerceCatalogHealthSchema, strictValidate } from './schemas';
import type { CommerceCatalogHealth } from './types';

export const commerceApi = {
  /** `GET /projects/{id}/commerce/catalog-health` (persisted projection). */
  getCatalogHealth: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<CommerceCatalogHealth>(
      `/projects/${projectId}/commerce/catalog-health`,
      options,
    );
    return strictValidate(commerceCatalogHealthSchema, res, 'commerce.getCatalogHealth');
  },
};
