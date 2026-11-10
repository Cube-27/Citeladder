'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { Button, type ButtonVariant } from '@/components/ui/button';
import { ProjectLink } from '@/components/ui/project-link';
import { actionHandoffHref, agentHandoffHref } from '@/lib/agent/handoff';
import { actionsQueries } from '@/lib/api/actions';
import { useOptionalProjectContext } from '@/lib/project/project-context';

/**
 * The Agent handoff for a screen that holds only an Action's id (a cited URL,
 * a prompt): New chat on the Action with its message already written, read
 * from the Action. The read is keyed by the active workspace alone, so the
 * button needs no project route. It waits for that read so a click never
 * opens an empty composer; an Action that cannot be read hands off with its
 * id alone, and New chat says it is unavailable.
 */
export function ActionAgentButton({
  actionId,
  variant,
  children,
}: Readonly<{ actionId: string; variant: ButtonVariant; children: ReactNode }>) {
  const workspaceId = useOptionalProjectContext()?.activeWorkspaceId ?? null;
  const action = useQuery({
    ...actionsQueries.detail(workspaceId ?? '', actionId),
    enabled: workspaceId !== null,
  });
  if (workspaceId !== null && action.isPending)
    return (
      <Button variant={variant} disabled>
        {children}
      </Button>
    );
  return (
    <Button asChild variant={variant}>
      <ProjectLink
        href={action.data ? actionHandoffHref(action.data) : agentHandoffHref({ actionId })}
      >
        {children}
      </ProjectLink>
    </Button>
  );
}
