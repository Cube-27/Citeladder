'use client';

import { useParams } from 'next/navigation';

import { WebsitePageDetailRouteContent } from '@/components/site-health/site-health-route-content';

/** Next entry for the shared crawl-bounded Website page detail. */
export default function UrlDetailPage() {
  const params = useParams<{ crawlId: string; siteUrlId: string }>();
  return <WebsitePageDetailRouteContent crawlId={params.crawlId} siteUrlId={params.siteUrlId} />;
}
