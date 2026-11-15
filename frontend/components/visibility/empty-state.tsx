import { Activity, Rocket } from 'lucide-react';

import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import type { ActiveRun } from '@/lib/visibility/dashboard';
import { useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Empty state for a project with no completed runs. The dashboard is a
 * projection over completed audits, so there is nothing to render until one
 * finishes. It carries its own next step: Launch run (the masthead leaves it
 * out meanwhile), or, while a run is in progress, the way to watch it.
 */
export function VisibilityEmptyState({ activeRun }: Readonly<{ activeRun: ActiveRun | null }>) {
  const canRun = useWorkspaceCapability('run');
  if (activeRun)
    return (
      <StateBlock
        kind="empty"
        icon={Activity}
        heading="A run is in progress"
        description="Results appear here when it finishes."
        action={
          <Button asChild variant="secondary">
            <ProjectLink href={`/runs/${activeRun.id}`}>
              <Icon icon={Activity} />
              Watch live progress
            </ProjectLink>
          </Button>
        }
      />
    );
  return (
    <StateBlock
      kind="empty"
      icon={Rocket}
      heading="No completed runs yet"
      description={
        canRun
          ? 'A run asks AI answer engines your prompts and measures how they talk about your brand.'
          : 'No run has measured how AI answer engines talk about this brand yet.'
      }
      action={canRun ? <LaunchAuditButton captioned /> : undefined}
    />
  );
}
