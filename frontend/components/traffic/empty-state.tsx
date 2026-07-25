import Link from 'next/link';
import { Plug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Empty state for a project with no persisted Traffic snapshot. Traffic renders
 * persisted sync projections only, so there is nothing to show until an
 * integration syncs. When connections already exist (`hasConnections`) the copy
 * switches from "connect one" to "the first sync is on its way" — the CTA lands
 * on Settings → Integrations either way.
 *
 * Copy is one line per state. Both previously opened with the same sentence
 * enumerating what Traffic projects (impressions, clicks, sessions,
 * conversions, organic vs AI-driven) before saying what to do about it — the
 * screen shows all of that as soon as it has data.
 */
export function TrafficEmptyState({
  hasConnections = false,
}: Readonly<{ hasConnections?: boolean }>) {
  return (
    <EmptyState
      icon={Plug}
      heading={hasConnections ? 'Your first sync is on its way' : 'Connect search data'}
      description={
        hasConnections
          ? 'Results appear here once the first sync completes.'
          : 'Connect Search Console or Google Analytics 4 to see organic and AI-driven traffic.'
      }
      action={
        <Button asChild variant={hasConnections ? 'secondary' : 'primary'} size="md">
          <Link href="/settings?tab=integrations">
            {hasConnections ? 'Open integrations' : 'Connect an integration'}
          </Link>
        </Button>
      }
    />
  );
}
