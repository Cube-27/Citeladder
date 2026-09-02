/**
 * Client for the website-grounded Content generation queue.
 *
 * Content has one workflow: enqueue, inspect bounded history/detail, retry,
 * cancel, regenerate, and record feedback. The backend assembles canonical
 * brand, target, issue, and related-page context; `getContextPreview` exposes
 * only its compact summary before a draft is requested.
 */
import { z } from 'zod';

import { CONTENT_LIST_DEFAULT_LIMIT } from '@/lib/config/operational';

import { apiClient, type ApiRequestOptions } from './client';
import {
  contentContextPreviewSchema,
  contentGenerationDetailSchema,
  contentGenerationListItemSchema,
  contentSkillCatalogSchema,
  contentSkillViewSchema,
  contentTargetPageSchema,
  strictValidate,
} from './schemas';
import { definedQuery, withQuery } from './shared';
import type {
  ContentContextPreview,
  ContentFeedbackReason,
  ContentGenerationDetail,
  ContentGenerationListItem,
} from './types';

export {
  CONTENT_DETAIL_POLL_MS,
  CONTENT_LIST_DEFAULT_LIMIT,
  CONTENT_LIST_POLL_MS,
  CONTENT_INSTRUCTION_MAX_LEN,
} from '@/lib/config/operational';

/** A skill id. The catalog is server-owned — never hardcode the set. */
type ContentSkill = string;
export type ContentSkillView = z.infer<typeof contentSkillViewSchema>;
export type ContentSkillCatalog = z.infer<typeof contentSkillCatalogSchema>;
export type ContentTargetPage = z.infer<typeof contentTargetPageSchema>;

const contentGenerationListSchema = z.array(contentGenerationListItemSchema);

export type SiteHealthReferenceInput = {
  project_id: string;
  crawl_id: string;
  site_url_id: string;
  source_analysis_id: string;
  dimension: string;
  checkpoint_ids: string[];
};

export type ContentContextPreviewInput = {
  target_site_url_id?: string;
  target_url?: string;
  opportunity_id?: string;
  demand_signal_id?: string;
  site_health_reference?: SiteHealthReferenceInput;
};

export type EnqueueGenerationInput = {
  project_id: string;
  user_instruction: string;
  skill_id?: ContentSkill;
  target_site_url_id?: string;
  target_url?: string;
  opportunity_id?: string;
  demand_signal_id?: string;
  site_health_reference?: SiteHealthReferenceInput;
};

export const contentApi = {
  /** The reusable output formats a generation may request. */
  listSkills: async (options?: ApiRequestOptions): Promise<ContentSkillCatalog> => {
    const response = await apiClient.get<unknown>('/content/skills', options);
    return strictValidate(contentSkillCatalogSchema, response, 'content.listSkills');
  },

  /** Compact summary of the canonical context available to a draft. */
  getContextPreview: async (
    projectId: string,
    input: ContentContextPreviewInput = {},
    options?: ApiRequestOptions,
  ): Promise<ContentContextPreview> => {
    const reference = input.site_health_reference;
    const path = withQuery(
      '/content/context-preview',
      definedQuery({
        project_id: projectId,
        target_site_url_id: input.target_site_url_id,
        target_url: input.target_url,
        opportunity_id: input.opportunity_id,
        demand_signal_id: input.demand_signal_id,
        site_health_crawl_id: reference?.crawl_id,
        site_health_site_url_id: reference?.site_url_id,
        site_health_source_analysis_id: reference?.source_analysis_id,
        site_health_dimension: reference?.dimension,
        site_health_checkpoint_ids: reference?.checkpoint_ids.join(','),
      }),
    );
    const response = await apiClient.get<unknown>(path, options);
    return strictValidate(contentContextPreviewSchema, response, 'content.getContextPreview');
  },

  listTargetPages: async (
    projectId: string,
    query: string,
    options?: ApiRequestOptions,
  ): Promise<ContentTargetPage[]> => {
    const path = withQuery('/content/target-pages', definedQuery({ project_id: projectId, query }));
    const response = await apiClient.get<unknown>(path, options);
    return strictValidate(z.array(contentTargetPageSchema), response, 'content.listTargetPages');
  },

  listGenerations: async (
    projectId: string,
    limit: number = CONTENT_LIST_DEFAULT_LIMIT,
    options?: ApiRequestOptions,
  ): Promise<ContentGenerationListItem[]> => {
    const path = withQuery('/content/generations', definedQuery({ project_id: projectId, limit }));
    const response = await apiClient.get<ContentGenerationListItem[]>(path, options);
    return strictValidate(contentGenerationListSchema, response, 'content.listGenerations');
  },

  enqueueGeneration: async (
    input: EnqueueGenerationInput,
    idempotencyKey?: string,
    options?: ApiRequestOptions,
  ): Promise<ContentGenerationDetail> => {
    const response = await apiClient.post<ContentGenerationDetail>('/content/generations', input, {
      ...options,
      idempotencyKey,
    });
    return strictValidate(contentGenerationDetailSchema, response, 'content.enqueueGeneration');
  },

  getGeneration: async (
    generationId: string,
    options?: ApiRequestOptions,
  ): Promise<ContentGenerationDetail> => {
    const response = await apiClient.get<ContentGenerationDetail>(
      `/content/generations/${generationId}`,
      options,
    );
    return strictValidate(contentGenerationDetailSchema, response, 'content.getGeneration');
  },

  regenerateGeneration: async (
    generationId: string,
    options?: ApiRequestOptions,
  ): Promise<ContentGenerationDetail> => {
    const response = await apiClient.post<ContentGenerationDetail>(
      `/content/generations/${generationId}/regenerate`,
      undefined,
      options,
    );
    return strictValidate(contentGenerationDetailSchema, response, 'content.regenerateGeneration');
  },

  tryAgainGeneration: async (
    generationId: string,
    options?: ApiRequestOptions,
  ): Promise<ContentGenerationDetail> => {
    const response = await apiClient.post<ContentGenerationDetail>(
      `/content/generations/${generationId}/try-again`,
      undefined,
      options,
    );
    return strictValidate(contentGenerationDetailSchema, response, 'content.tryAgainGeneration');
  },

  cancelGeneration: async (
    generationId: string,
    options?: ApiRequestOptions,
  ): Promise<ContentGenerationDetail> => {
    const response = await apiClient.post<ContentGenerationDetail>(
      `/content/generations/${generationId}/cancel`,
      undefined,
      options,
    );
    return strictValidate(contentGenerationDetailSchema, response, 'content.cancelGeneration');
  },

  deleteGeneration: (generationId: string, options?: ApiRequestOptions): Promise<void> =>
    apiClient.delete<void>(`/content/generations/${generationId}`, options),

  clearGenerationHistory: (projectId: string, options?: ApiRequestOptions): Promise<void> =>
    apiClient.delete<void>(
      withQuery('/content/generations', definedQuery({ project_id: projectId })),
      options,
    ),

  recordFeedback: async (
    generationId: string,
    feedback: 'accepted' | 'rejected',
    reason?: ContentFeedbackReason,
    options?: ApiRequestOptions,
  ): Promise<ContentGenerationDetail> => {
    const response = await apiClient.post<ContentGenerationDetail>(
      `/content/generations/${generationId}/feedback`,
      reason ? { feedback, reason } : { feedback },
      options,
    );
    return strictValidate(contentGenerationDetailSchema, response, 'content.recordFeedback');
  },
};
