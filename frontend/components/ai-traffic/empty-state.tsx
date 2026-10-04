import { Link } from 'react-router-dom';
import { BarChart3, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

/**
 * A filtered AI Traffic table with no matching rows. It replaces the table
 * rather than drawing column headers over nothing, and says absence is an
 * observation within the available logs, not proof of no traffic.
 */
export function TrafficNoResults({
  heading,
  description,
}: Readonly<{ heading: string; description: string }>) {
  return <EmptyState icon={SearchX} heading={heading} description={description} />;
}

/**
 * Empty state for `/ai-traffic`. Referral measurement begins only after a
 * persisted GA4 source/medium report has been synced.
 */
export function AiReferralsEmptyState() {
  const { activeWorkspaceId } = useProjectContext();
  const settingsHref = activeWorkspaceId
    ? workspaceDestination(
        '/settings',
        new URLSearchParams({ tab: 'integrations' }),
        activeWorkspaceId,
      )
    : '/settings?tab=integrations';

  return (
    <EmptyState
      icon={BarChart3}
      heading="No AI-referral data yet"
      description="Connect Google Analytics 4 and sync traffic to see which known AI sources send sessions."
      action={
        <Button asChild size="md">
          <Link to={settingsHref}>Open integration settings</Link>
        </Button>
      }
    />
  );
}
