'use client';

import { useSearchParams } from 'react-router-dom';
import { Suspense } from 'react';

import type { SiteHealthReferenceInput } from '@/lib/api/content';
import { DEMAND_SIGNAL_PARAM } from '@/lib/demand/content-link';

import { ContentScreen } from './content-screen';

function siteHealthReference(searchParams: URLSearchParams): SiteHealthReferenceInput | undefined {
  const projectId = searchParams.get('project_id');
  const crawlId = searchParams.get('site_health_crawl_id');
  const siteUrlId = searchParams.get('site_url_id');
  // Optional: a link written before terminalization carries a revision id
  // that no longer exists, so requiring it turned every such arrival into a
  // "could not be authorized or loaded" alert. The server resolves the
  // page's current analysis from the crawl and the URL.
  const sourceAnalysisId = searchParams.get('source_analysis_id');
  const dimension = searchParams.get('dimension');
  const checkpointIds = searchParams
    .getAll('checkpoint_ids')
    .map((checkpointId) => checkpointId.trim())
    .filter(Boolean);
  if (!projectId || !crawlId || !siteUrlId || !dimension || checkpointIds.length === 0) {
    return undefined;
  }
  return {
    project_id: projectId,
    crawl_id: crawlId,
    site_url_id: siteUrlId,
    ...(sourceAnalysisId ? { source_analysis_id: sourceAnalysisId } : {}),
    dimension,
    checkpoint_ids: checkpointIds,
  };
}

function ContentRouteSurface() {
  const searchParams = useSearchParams()[0];
  return (
    <ContentScreen
      opportunityId={searchParams.get('opportunity_id')}
      demandSignalId={searchParams.get(DEMAND_SIGNAL_PARAM)}
      siteHealthReference={siteHealthReference(searchParams)}
    />
  );
}

/** Shared /content route content, including deep-link context inputs. */
export function ContentRouteContent() {
  return (
    <Suspense fallback={null}>
      <ContentRouteSurface />
    </Suspense>
  );
}
