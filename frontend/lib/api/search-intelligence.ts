import { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';

const targetSchema = z.strictObject({
  identity: z.string(),
  label: z.string(),
  registrable_domain: z.string(),
  hostname: z.string(),
  origin: z.string(),
  source_kind: z.string(),
});
const preferencesSchema = z.strictObject({
  owned_target_id: z.string().nullable(),
  competitor_ids: z.array(z.uuid()),
  location_code: z.number().int().nullable(),
  language_code: z.string(),
  reuse_recent: z.boolean(),
  depths: z.record(z.string(), z.number().int()),
});
const runSchema = z.strictObject({
  id: z.uuid(),
  status: z.string(),
  action: z.string(),
  pricing_version: z.string(),
  estimated_cost_usd: z.string(),
  provider_reported_cost_usd: z.string().nullable(),
  planned_calls: z.number().int(),
  completed_calls: z.number().int(),
  planned_rows: z.number().int(),
  received_rows: z.number().int(),
  uncertain_calls: z.number().int(),
  error_code: z.string(),
  error_detail: z.string(),
  expires_at: z.string(),
  confirmed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  frozen_scope: z.record(z.string(), z.unknown()),
  call_plan: z.array(z.record(z.string(), z.unknown())),
  reused_datasets: z.array(z.record(z.string(), z.unknown())),
  created_at: z.string(),
});
const datasetSchema = z.looseObject({
  id: z.uuid(),
  run_id: z.uuid(),
  dataset_kind: z.string(),
  target_domain: z.string(),
  target_hostname: z.string(),
  target_origin: z.string(),
  comparison_origin: z.string(),
  location_code: z.number().int().nullable(),
  language_code: z.string(),
  status: z.string(),
  coverage: z.string(),
  requested_rows: z.number().int(),
  raw_rows_received: z.number().int(),
  unique_rows_saved: z.number().int(),
  provider_total: z.number().int().nullable(),
  truncated: z.boolean(),
  summary: z.record(z.string(), z.unknown()),
  collection_started_at: z.string().nullable(),
  collection_ended_at: z.string().nullable(),
  published_at: z.string().nullable(),
});
const readinessSchema = z.strictObject({
  connected: z.boolean(),
  connection_id: z.uuid().nullable(),
  owned_targets: z.array(targetSchema),
  competitors: z.array(targetSchema),
  preferences: preferencesSchema,
  latest_run: runSchema.nullable(),
  datasets: z.array(datasetSchema),
});
const rowSchema = z.looseObject({
  id: z.uuid(),
  dataset_id: z.uuid(),
  call_id: z.uuid().nullable(),
  row_kind: z.string(),
  keyword: z.string(),
  domain: z.string(),
  url: z.string(),
  search_volume: z.number().int().nullable(),
  difficulty: z.number().int().nullable(),
  intent: z.string(),
  rank_group: z.number().int().nullable(),
  owned_rank_group: z.number().int().nullable(),
  etv: z.string().nullable(),
  backlinks: z.number().int().nullable(),
  referring_main_domains: z.number().int().nullable(),
  dataforseo_rank: z.number().int().nullable(),
  auxiliary: z.record(z.string(), z.unknown()),
});
const pageSchema = z.strictObject({
  dataset: datasetSchema,
  rows: z.array(rowSchema),
  next_cursor: z.string().nullable(),
});
const contentHandoffSchema = z.strictObject({
  project_id: z.uuid(),
  dataset_id: z.uuid(),
  row_ids: z.array(z.uuid()),
  evidence: z.array(z.record(z.string(), z.unknown())),
});

export type SearchIntelligenceReadiness = z.infer<typeof readinessSchema>;
export type SearchIntelligenceRun = z.infer<typeof runSchema>;
export type SearchIntelligenceDataset = z.infer<typeof datasetSchema>;
export type SearchIntelligenceRow = z.infer<typeof rowSchema>;
export type SearchIntelligenceHandoff = z.infer<typeof contentHandoffSchema>;
export type DatasetSelection = {
  kind: string;
  competitor_id?: string | null;
  depth: number;
  seed?: string;
};
export type ReviewPayload = {
  action: string;
  owned_target_id?: string | null;
  connection_id?: string | null;
  location_code?: number | null;
  language_code?: string;
  reuse_recent: boolean;
  save_as_defaults?: boolean;
  datasets: DatasetSelection[];
  previous_run_id?: string | null;
};

const root = (projectId: string) => `/projects/${projectId}/search-intelligence`;
export const searchIntelligenceApi = {
  readiness: async (projectId: string, options?: ApiRequestOptions) =>
    readinessSchema.parse(await apiClient.get<unknown>(root(projectId), options)),
  review: async (projectId: string, payload: ReviewPayload, options?: ApiRequestOptions) =>
    runSchema.parse(
      await apiClient.post<unknown>(`${root(projectId)}/reviews`, payload, {
        ...options,
        idempotencyKey: options?.idempotencyKey ?? `si-review:${globalThis.crypto.randomUUID()}`,
      }),
    ),
  confirm: async (projectId: string, runId: string, options?: ApiRequestOptions) =>
    runSchema.parse(
      await apiClient.post<unknown>(`${root(projectId)}/runs/${runId}/confirm`, {}, options),
    ),
  cancel: async (projectId: string, runId: string, options?: ApiRequestOptions) =>
    runSchema.parse(
      await apiClient.post<unknown>(`${root(projectId)}/runs/${runId}/cancel`, {}, options),
    ),
  runs: async (projectId: string, options?: ApiRequestOptions) =>
    z.array(runSchema).parse(await apiClient.get<unknown>(`${root(projectId)}/runs`, options)),
  rows: async (
    projectId: string,
    datasetId: string,
    options?: ApiRequestOptions,
    params: { cursor?: string; limit?: number; sort?: string; direction?: 'asc' | 'desc' } = {},
  ) => {
    const query = new URLSearchParams({ limit: String(params.limit ?? 200) });
    if (params.cursor) query.set('cursor', params.cursor);
    if (params.sort) query.set('sort', params.sort);
    if (params.direction) query.set('direction', params.direction);
    return pageSchema.parse(
      await apiClient.get<unknown>(
        `${root(projectId)}/datasets/${datasetId}/rows?${query}`,
        options,
      ),
    );
  },
  deriveCitationMatches: async (
    projectId: string,
    backlinkDatasetId: string,
    auditIds: string[],
    options?: ApiRequestOptions,
  ) =>
    datasetSchema.parse(
      await apiClient.post<unknown>(
        `${root(projectId)}/citation-matches`,
        { backlink_dataset_id: backlinkDatasetId, audit_ids: auditIds },
        options,
      ),
    ),
  contentHandoff: async (
    projectId: string,
    datasetId: string,
    rowIds: string[],
    options?: ApiRequestOptions,
  ) =>
    contentHandoffSchema.parse(
      await apiClient.post<unknown>(
        `${root(projectId)}/content-handoff`,
        { dataset_id: datasetId, row_ids: rowIds },
        options,
      ),
    ),
  savePreferences: async (
    projectId: string,
    payload: z.infer<typeof preferencesSchema>,
    options?: ApiRequestOptions,
  ) =>
    preferencesSchema.parse(
      await apiClient.put<unknown>(`${root(projectId)}/preferences`, payload, options),
    ),
};
