import { Link } from 'react-router-dom';
import type { z } from 'zod';
import type { crawlLogAvailabilitySchema } from '@citeladder/contracts/ai-traffic';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';

export function CrawlLogAvailabilityNotice({
  availability,
  workspaceId,
}: Readonly<{ availability: z.infer<typeof crawlLogAvailabilitySchema>; workspaceId: string }>) {
  if (availability === 'disabled')
    return (
      <Notice tone="info">Collection is paused by CiteLadder. New log batches are refused.</Notice>
    );
  if (availability === 'not_in_plan')
    return (
      <Notice tone="info">
        AI crawler logs are included in paid plans.{' '}
        <TextLink asChild text="inherit">
          <Link to={workspaceDestination('/billing', null, workspaceId)}>Choose a plan</Link>
        </TextLink>
      </Notice>
    );
  return null;
}
