import { ChevronDown, Pencil, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import type { Project } from '@/lib/api/types';
import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { newProjectDestination } from '@/lib/navigation/project-destination';

export function ProjectControls({
  activeProject,
  onEditProject,
}: Readonly<{
  activeProject: Project;
  onEditProject?: (project: Project) => void;
}>) {
  const router = useNavigate();
  const { activeWorkspaceId } = useProjectContext();
  const { entitlement } = useEntitlement();
  const remainingProjectSlots = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  // Both must permit it: the caller's ROLE, and the workspace's remaining
  // allowance. A Viewer is never offered the creation affordance, matching
  // the switcher — and the backend refuses it either way.
  const mayCreate = useWorkspaceCapability('write');
  const canAddProject =
    mayCreate && remainingProjectSlots !== undefined && remainingProjectSlots > 0;
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="secondary" size="md" className="gap-1.5">
          Manage project <ChevronDown className="size-3.5 opacity-80" aria-hidden />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-56">
        {onEditProject ? (
          <DropdownItem onSelect={() => onEditProject(activeProject)}>
            <Pencil className="size-4" aria-hidden /> Edit active project
          </DropdownItem>
        ) : null}
        {canAddProject ? (
          <DropdownItem onSelect={() => router(newProjectDestination(activeWorkspaceId))}>
            <Plus className="size-4" aria-hidden /> Add project
          </DropdownItem>
        ) : null}
      </DropdownContent>
    </Dropdown>
  );
}
