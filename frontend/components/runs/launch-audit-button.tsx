import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { ActionButton } from '@/components/ui/actions';
import type { ButtonProps } from '@/components/ui/button';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useActiveProject, useWorkspaceCapability } from '@/lib/project/project-context';

import { LaunchDialog } from './launch-dialog';

type LaunchRunProps = Omit<ButtonProps, 'variant' | 'asChild' | 'children' | 'onClick'>;

/**
 * Launch run: opens the shared run configuration dialog and routes directly
 * to the new run. Its words and look are the `launchRun` preset on every page.
 * A role that may not run audits is not offered it.
 */
export function LaunchAuditButton(props: Readonly<LaunchRunProps>) {
  return useWorkspaceCapability('run') ? <LaunchAudit {...props} /> : null;
}

function LaunchAudit(buttonProps: Readonly<LaunchRunProps>) {
  const project = useActiveProject();
  const projectHref = useProjectHref();
  const router = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton
        action="launchRun"
        {...buttonProps}
        disabled={!project || buttonProps.disabled}
        onClick={() => setOpen(true)}
      />
      {project ? (
        <LaunchDialog
          open={open}
          onOpenChange={setOpen}
          projectId={project.id}
          onLaunched={(audit) => router(projectHref(`/runs/${audit.id}`))}
        />
      ) : null}
    </>
  );
}
