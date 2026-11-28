import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { useProjectCreation } from '@/components/layout/use-project-creation';
import type { Project } from '@citeladder/contracts';
import { ChevronDown, Pencil, Plus } from '@/lib/icons';
import { newProjectDestination } from '@/lib/navigation/project-destination';
import { TitleCaption } from '@/components/ui/title-caption';

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
          Manage project <Icon icon={ChevronDown} muted />
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
            <TitleCaption
              title="Add project"
              caption={remainingProjectSlots === 0 ? 'Project limit reached' : null}
            />
          </MenuItem>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
