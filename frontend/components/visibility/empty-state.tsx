import { FirstRunAction } from '@/components/runs/launch-audit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import { Activity, Rocket } from '@/lib/icons';
import { AUDIT_STATES } from '@/lib/runs/status';
import type { ActiveRun } from '@/lib/visibility/dashboard';
import { useWorkspaceCapability } from '@/lib/project/project-context';

export type EmptyPage = 'brand' | 'perception' | 'competitors' | 'sources';

function emptyHeading(page: EmptyPage): string {
  switch (page) {
    case 'brand':
      return 'No brand data yet';
    case 'perception':
      return 'No perception data yet';
    case 'competitors':
      return 'No competitor data yet';
    case 'sources':
      return 'No source data yet';
    default: {
      const unhandled: never = page;
      return unhandled;
    }
  }
}

export function VisibilityEmptyState({
  activeRun,
  page,
}: Readonly<{ activeRun: ActiveRun | null; page: EmptyPage }>) {
  const canRun = useWorkspaceCapability('run');
  if (activeRun)
    return (
      <StateBlock
        kind="empty"
        icon={Activity}
        heading="A run is in progress"
        description={AUDIT_STATES[activeRun.status].label}
        action={
          <Button asChild>
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
      heading={emptyHeading(page)}
      action={canRun ? <FirstRunAction /> : undefined}
    />
  );
}
