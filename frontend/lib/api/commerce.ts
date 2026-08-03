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
import {
  commerceCandidateAcceptSchema, commerceCandidateSchema, commerceCatalogHealthSchema,
  commerceDiscoveryPreviewSchema, commerceDiscoveryRunSchema, competitorComparisonSnapshotSchema,
  strictValidate,
} from './schemas';
import type {
  CommerceCandidateAccept, CommerceCandidateInput, CommerceCatalogHealth, CommerceDiscoveryPreview,
  CommerceDiscoveryRun, CompetitorComparisonSnapshot,
} from './types';

export type CommerceDiscoveryCreateInput = {
  input_kind: 'upload' | 'url'; rows?: CommerceCandidateInput[]; source_urls?: string[];
};
export type CommerceCandidateDecisionInput = {
  status: 'accepted' | 'rejected'; target_id?: string | null; competitor_id?: string | null; review_note?: string;
};

export const commerceApi = {
  /** `GET /projects/{id}/commerce/catalog-health` (persisted projection). */
  getCatalogHealth: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<CommerceCatalogHealth>(
      `/projects/${projectId}/commerce/catalog-health`,
      options,
    );
    return strictValidate(commerceCatalogHealthSchema, res, 'commerce.getCatalogHealth');
  },
  previewDiscovery: async (
    projectId: string, body: { rows?: CommerceCandidateInput[]; csv_text?: string }, options?: ApiRequestOptions,
  ) => strictValidate(commerceDiscoveryPreviewSchema, await apiClient.post<CommerceDiscoveryPreview>(
    `/projects/${projectId}/commerce/discovery/preview`, body, options), 'commerce.previewDiscovery'),
  createDiscoveryRun: async (projectId: string, body: CommerceDiscoveryCreateInput, options?: ApiRequestOptions) =>
    strictValidate(commerceDiscoveryRunSchema, await apiClient.post<CommerceDiscoveryRun>(
      `/projects/${projectId}/commerce/discovery/runs`, body, options), 'commerce.createDiscoveryRun'),
  listDiscoveryRuns: async (projectId: string, options?: ApiRequestOptions) =>
    strictValidate(commerceDiscoveryRunSchema.array(), await apiClient.get<CommerceDiscoveryRun[]>(
      `/projects/${projectId}/commerce/discovery/runs`, options), 'commerce.listDiscoveryRuns'),
  listDiscoveryCandidates: async (projectId: string, runId?: string, options?: ApiRequestOptions) => {
    const query = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
    return strictValidate(commerceCandidateSchema.array(), await apiClient.get(
      `/projects/${projectId}/commerce/discovery/candidates${query}`, options), 'commerce.listDiscoveryCandidates');
  },
  decideCandidate: async (candidateId: string, body: CommerceCandidateDecisionInput, options?: ApiRequestOptions) =>
    strictValidate(commerceCandidateAcceptSchema, await apiClient.post<CommerceCandidateAccept>(
      `/commerce/discovery/candidates/${candidateId}/accept`, body, options), 'commerce.decideCandidate'),
  createComparison: async (projectId: string, competitorId?: string, options?: ApiRequestOptions) =>
    strictValidate(competitorComparisonSnapshotSchema, await apiClient.post<CompetitorComparisonSnapshot>(
      `/projects/${projectId}/commerce/comparisons`, { competitor_id: competitorId ?? null }, options), 'commerce.createComparison'),
  listComparisons: async (projectId: string, options?: ApiRequestOptions) =>
    strictValidate(competitorComparisonSnapshotSchema.array(), await apiClient.get<CompetitorComparisonSnapshot[]>(
      `/projects/${projectId}/commerce/comparisons`, options), 'commerce.listComparisons'),
};
