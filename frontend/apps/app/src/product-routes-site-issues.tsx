import { useParams } from 'next/navigation';

import {
  IssuesRouteContent,
  WebsitePageDetailRouteContent,
  WebsiteRouteContent,
} from '@/components/site-health/site-health-route-content';

/** `/site` — the active project's current Site Health dashboard. */
export function WebsiteRoute() {
  return <WebsiteRouteContent />;
}

/** `/site/crawls/:crawlId/pages/:siteUrlId` — one crawl-bounded page detail. */
export function WebsitePageDetailRoute() {
  const { crawlId, siteUrlId } = useParams<{ crawlId: string; siteUrlId: string }>();
  return <WebsitePageDetailRouteContent crawlId={crawlId} siteUrlId={siteUrlId} />;
}

/** `/issues` — the active project's current-crawl issue catalog. */
export function IssuesRoute() {
  return <IssuesRouteContent />;
}
