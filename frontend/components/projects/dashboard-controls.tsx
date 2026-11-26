import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { useProjectCreation } from '@/components/layout/use-project-creation';
import type { Project } from '@citeladder/contracts';
import { ChevronDown, Pencil, Plus } from '@/lib/icons';
import { newProjectDestination } from '@/lib/navigation/project-destination';

export function ProjectControls({
  activeProject,
  onEditProject,
}: Readonly<{
  activeProject: Project;
  onEditProject?: (project: Project) => void;
}>) {
  const router = useNavigate();
  const { activeWorkspaceId, mayCreate, canAddProject, remainingProjectSlots } =
    useProjectCreation();
  if (!onEditProject && !mayCreate) return null;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary">
          Manage project <Icon icon={ChevronDown} className="opacity-80" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        {onEditProject ? (
          <MenuItem icon={<Icon icon={Pencil} />} onSelect={() => onEditProject(activeProject)}>
            Edit active project
          </MenuItem>
        ) : null}
        {mayCreate ? (
          <MenuItem
            icon={<Icon icon={Plus} />}
            disabled={!canAddProject}
            onSelect={() => router(newProjectDestination(activeWorkspaceId))}
          >
            <span className="grid min-w-0 flex-1">
              <span>Add project</span>
              {remainingProjectSlots === 0 && (
                <span className="text-caption text-ink-2">Project limit reached</span>
              )}
            </span>
          </MenuItem>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
