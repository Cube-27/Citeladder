'use client';

import { useParams } from 'next/navigation';

import { UrlDetail } from '@/components/site-health/url-detail';

/** Canonical crawl-bounded Website page detail. */
export default function UrlDetailPage() {
  const params = useParams<{ crawlId: string; siteUrlId: string }>();
  return <UrlDetail crawlId={params.crawlId} siteUrlId={params.siteUrlId} />;
}
