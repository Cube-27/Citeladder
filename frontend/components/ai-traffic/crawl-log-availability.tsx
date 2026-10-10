import { Link } from 'react-router-dom';
import type { z } from 'zod';
import type { crawlLogAvailabilitySchema } from '@citeladder/contracts/ai-traffic';
import { Alert } from '@/components/ui/alert';
import { workspaceDestination } from '@/lib/navigation/project-destination';

/**
 * Why crawl log collection is unavailable: the plan lacks AI crawler logs (an
 * upgrade link) or CiteLadder paused collection everywhere. Nothing when available.
 */
export function CrawlLogAvailabilityNotice({
  availability,
  workspaceId,
}: Readonly<{ availability: z.infer<typeof crawlLogAvailabilitySchema>; workspaceId: string }>) {
  if (availability === 'disabled')
    return (
      <Alert tone="info">
        Collection is paused by CiteLadder. Sources keep their settings and reports stay readable;
        new log batches are refused until collection resumes.
      </Alert>
    );
  if (availability === 'not_in_plan')
    return (
      <Alert tone="info">
        AI crawler logs are included in paid plans. They show which AI crawlers fetch your pages,
        straight from your CDN or server logs.{' '}
        <Link
          to={workspaceDestination('/billing', null, workspaceId)}
          className="underline underline-offset-2"
        >
          Choose a plan
        </Link>
      </Alert>
    );
  return null;
}
