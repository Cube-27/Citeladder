import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  type ContentSkillView,
  type ContentContextPreviewInput,
  contentApi,
  type SiteHealthReferenceInput,
} from '@/lib/api/content';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import { siteHealthApi } from '@/lib/api/site-health';
import { queryKeys } from '@/lib/api/query-keys';
import { ApiError, httpErrorStatus } from '@/lib/api/errors';

/** Map an action failure to its specific user-facing message when possible. */
export function actionErrorMessage(error: unknown): string {
  if (httpErrorStatus(error) === 409) {
    const body = error instanceof ApiError ? error.body : '';
    if (body.includes('provider_not_configured')) {
      return 'Content generation is not configured — a provider API key is missing.';
    }
    if (body.includes('cancel_not_allowed')) {
      return 'This generation already finished, so it can no longer be cancelled.';
    }
    if (body.includes('delete_not_allowed')) {
      return 'This generation is still active. Cancel it before deleting it.';
    }
    if (body.includes('idempotency_conflict')) {
      return 'A different request was already submitted with this key. Please try again.';
    }
  }
  return 'Something went wrong while generating your content. You can try again.';
}

/** The server-owned skill catalog. Static config, so it never refetches. */
export function useSkillCatalog() {
  return useQuery({
    queryKey: queryKeys.content.skills(),
    queryFn: ({ signal }) => contentApi.listSkills({ signal }),
    staleTime: Infinity,
  });
}

/**
 * Canonical context available to a draft for this project, so the composer can
 * say so before Generate rather than after. Cheap enough to refetch on a
 * project switch, stale-tolerant enough not to poll.
 */
export function useContentContextPreview(projectId: string, input: ContentContextPreviewInput) {
  return useQuery({
    queryKey: queryKeys.content.contextPreview(projectId, input),
    queryFn: ({ signal }) => contentApi.getContextPreview(projectId, input, { signal }),
    staleTime: 60_000,
  });
}

export function useContentTargetPages(projectId: string, query: string) {
  return useQuery({
    queryKey: queryKeys.content.targetPages(projectId, query),
    queryFn: ({ signal }) => contentApi.listTargetPages(projectId, query, { signal }),
    staleTime: 60_000,
  });
}

export function useSiteHealthHandoff(reference?: SiteHealthReferenceInput) {
  return useQuery({
    queryKey: reference
      ? queryKeys.siteHealth.contentHandoff(
          reference.project_id,
          reference.crawl_id,
          reference.site_url_id,
          reference.source_analysis_id,
          reference.dimension,
          reference.checkpoint_ids,
        )
      : queryKeys.siteHealth.contentHandoffUnavailable(),
    queryFn: ({ signal }) => {
      if (!reference) throw new Error('Site Health reference is required');
      return siteHealthApi.getContentHandoff(
        {
          projectId: reference.project_id,
          crawlId: reference.crawl_id,
          siteUrlId: reference.site_url_id,
          sourceAnalysisId: reference.source_analysis_id,
          dimension: reference.dimension,
          checkpointIds: reference.checkpoint_ids,
        },
        { signal },
      );
    },
    enabled: Boolean(reference),
  });
}

/** The opportunity behind a `?opportunity_id=` arrival, in its own words. */
export type ContentOpportunityContext = {
  id: string;
  title: string;
  target: string;
  targetUrl: string | null;
  pathway: 'owned' | 'earned';
  canonicalDomain: string | null;
  suggestedSkillId: string;
  limitations: string[];
  citations: Array<Record<string, unknown>>;
};

export function useOpportunityContext(
  opportunityId?: string | null,
): ContentOpportunityContext | null {
  const query = useQuery({
    ...opportunitiesQueries.detail(opportunityId ?? ''),
    enabled: Boolean(opportunityId),
  });
  const data = query.data;
  return useMemo(() => {
    if (!data) return null;
    return {
      id: data.id,
      title: data.title,
      target: data.target_url ?? data.target_theme ?? '',
      targetUrl: data.target_url,
      pathway: data.content_handoff.pathway,
      canonicalDomain: data.content_handoff.canonical_domain,
      suggestedSkillId: data.content_handoff.suggested_skill_id,
      limitations: data.content_handoff.limitations,
      citations: data.content_handoff.representative_citations,
    };
  }, [data]);
}

export type { ContentSkillView };
