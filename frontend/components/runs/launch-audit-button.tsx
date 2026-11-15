import { useNavigate } from 'react-router-dom';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ActionButton } from '@/components/ui/actions';
import type { ButtonProps } from '@/components/ui/button';
import { promptsQueries } from '@/lib/api/prompts';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useActiveProject, useWorkspaceCapability } from '@/lib/project/project-context';
import { launchReadiness } from '@/lib/runs/launch';

import { LaunchDialog } from './launch-dialog';

type LaunchRunProps = Omit<
  ButtonProps,
  'variant' | 'asChild' | 'children' | 'onClick' | 'disabled'
>;

/**
 * Launch run: opens the shared run configuration dialog and routes directly
 * to the new run. Its words and look are the `launchRun` preset on every page,
 * and whether it can launch is `launchReadiness`, so every entry agrees.
 * A role that may not run audits is not offered it.
 */
export function LaunchAuditButton(props: Readonly<LaunchRunProps>) {
  const canRun = useWorkspaceCapability('run');
  const project = useActiveProject();
  if (!canRun) return null;
  if (!project) return <ActionButton action="launchRun" {...props} disabled />;
  return <LaunchAudit {...props} projectId={project.id} />;
}

function LaunchAudit({
  projectId,
  ...buttonProps
}: Readonly<LaunchRunProps & { projectId: string }>) {
  const { workspaceId } = useProjectScope();
  const projectHref = useProjectHref();
  const router = useNavigate();
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  // A failed read is the screen's to name and retry; mounting here must not refetch it.
  const setsQuery = useQuery({
    ...promptsQueries.sets({ workspaceId, projectId }),
    retryOnMount: false,
  });
  const readiness = launchReadiness(
    setsQuery.status === 'success'
      ? { status: 'success', promptSets: setsQuery.data.prompt_sets }
      : { status: setsQuery.status },
  );
  const reason = readiness.kind === 'blocked' ? readiness.reason : null;

  return (
    <>
      <ActionButton
        action="launchRun"
        {...buttonProps}
        disabled={readiness.kind !== 'ready'}
        title={reason ?? undefined}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => setOpen(true)}
      />
      {reason ? (
        <span id={reasonId} hidden>
          {reason}
        </span>
      ) : null}
      <LaunchDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        onLaunched={(audit) => router(projectHref(`/runs/${audit.id}`))}
      />
    </>
  );
}
