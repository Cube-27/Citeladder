import { Activity, Rocket } from 'lucide-react';

import { FirstRunAction } from '@/components/runs/launch-audit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import { AUDIT_STATES } from '@/lib/runs/status';
import type { ActiveRun, VisibilityView } from '@/lib/visibility/dashboard';
import { useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Empty state for a project with no completed runs. The dashboard is a
 * projection over completed audits, so there is nothing to render until one
 * finishes. It carries its own next step: "Add prompts" while no prompt is
 * active, then Launch run (the masthead leaves it out meanwhile), or, while a
 * run is in progress, the way to watch it.
 */
function emptyDescription(view: VisibilityView): string {
  switch (view) {
    case 'insights':
      return 'Once a run finishes, this page shows how often AI engines mention and cite you.';
    case 'competitors':
      return 'Once a run finishes, this page ranks you against your competitors in AI answers.';
    case 'competitor':
      return 'Once a run finishes, this page compares this competitor’s mentions and citations with yours.';
    case 'perception':
      return 'Once a run finishes, this page shows how AI engines describe your brand.';
    case 'domains':
      return 'Once a run finishes, this page lists the domains AI engines cite.';
    case 'urls':
      return 'Once a run finishes, this page lists the pages AI engines cite.';
    case 'read-not-cited':
      return 'Once a run finishes, this page lists your pages that AI engines read but did not cite.';
    case 'query-fanout':
      return 'Once a run finishes, this page lists the search queries AI engines ran for your prompts.';
    case 'ads':
      return 'Once a run finishes, this page lists the paid ads shown in ChatGPT Search answers.';
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
}

export function VisibilityEmptyState({
  activeRun,
  view,
}: Readonly<{ activeRun: ActiveRun | null; view: VisibilityView }>) {
  const canRun = useWorkspaceCapability('run');
  if (activeRun)
    return (
      <StateBlock
        kind="empty"
        icon={Activity}
        heading="A run is in progress"
        description={`${AUDIT_STATES[activeRun.status].label}. Results appear here when it finishes.`}
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
      heading="No visibility data yet"
      description={emptyDescription(view)}
      action={canRun ? <FirstRunAction /> : undefined}
    />
  );
}
