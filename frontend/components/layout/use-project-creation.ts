'use client';

import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { newProjectDestination } from '@/lib/navigation/project-destination';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Whether the viewer may create a project in the active workspace.
 *
 * Both must permit it: the role (`write`), and the workspace's remaining
 * project allowance. `mayCreate` is the role alone, so the switcher can still
 * show a disabled "New project" with the reason when only the allowance is
 * exhausted.
 */
export function useProjectCreation() {
  const { activeWorkspaceId, isError } = useProjectContext();
  const { entitlement } = useEntitlement();
  const remainingProjectSlots = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  const mayCreate = useWorkspaceCapability('write');
  const canAddProject =
    !isError && mayCreate && remainingProjectSlots !== undefined && remainingProjectSlots > 0;
  return { activeWorkspaceId, mayCreate, canAddProject, remainingProjectSlots };
}

/**
 * The new-project route for `NoProjectState`, or null when the viewer cannot
 * create one, so the action is never offered and then refused.
 */
export function useCreateProjectHref(): string | null {
  const { activeWorkspaceId, canAddProject } = useProjectCreation();
  return canAddProject ? newProjectDestination(activeWorkspaceId) : null;
}
