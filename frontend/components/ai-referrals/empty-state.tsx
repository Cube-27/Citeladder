import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

/**
 * Empty state for `/ai-referrals`. Referral measurement begins only after a
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
