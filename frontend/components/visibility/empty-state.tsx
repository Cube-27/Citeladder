import { ProjectLink } from '@/components/ui/project-link';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StateBlock } from '@/components/ui/state-block';
import { useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Empty state for a project with no completed runs. The
 * dashboard is a projection over completed audits, so there is nothing to
 * render until one finishes. When a run is already in progress
 * (`hasActiveRun`), the copy and CTA switch from "launch one" to "one is on
 * its way".
 *
 * Copy is one line each: the old version listed what the dashboard would
 * eventually show (score, per-engine comparison, rankings), which the screen
 * makes obvious the moment it has data.
 */
export function VisibilityEmptyState({
  hasActiveRun = false,
}: Readonly<{ hasActiveRun?: boolean }>) {
  const canRun = useWorkspaceCapability('run');
  return (
    <StateBlock
      kind="empty"
      icon={Rocket}
      heading="No completed runs yet"
      description={emptyDescription({ hasActiveRun, canRun })}
      action={
        // Launch run is the masthead's one primary; this block does not repeat it.
        hasActiveRun ? (
          <Button asChild variant="secondary">
            <ProjectLink href="/runs">View runs</ProjectLink>
          </Button>
        ) : undefined
      }
    />
  );
}

/** A role that may not run audits is never pointed at a Launch run it is not offered. */
function emptyDescription({
  hasActiveRun,
  canRun,
}: Readonly<{ hasActiveRun: boolean; canRun: boolean }>): string {
  if (hasActiveRun) return 'A run is in progress. Results appear here when it finishes.';
  return canRun
    ? 'Launch run, above, measures how AI answer engines talk about your brand.'
    : 'No run has measured how AI answer engines talk about this brand yet.';
}
