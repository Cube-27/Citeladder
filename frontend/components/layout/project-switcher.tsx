import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  SidebarIdentButton,
  SidebarMarkPlaceholder,
  SidebarTextTooltip,
} from '@/components/ui/sidebar';
import { Text } from '@/components/ui/typography';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { BrandMark } from '@/components/ui/brand-mark';
import { Building2, Plus } from '@/lib/icons';
import { projectQueries } from '@/lib/api/projects';
import {
  newProjectDestination,
  useSelectProject,
  useSelectWorkspace,
} from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

import { useProjectCreation } from '@/components/layout/use-project-creation';

export function ProjectSwitcher() {
  const router = useNavigate();
  const queryClient = useQueryClient();
  const selectProject = useSelectProject();
  const selectWorkspace = useSelectWorkspace();
  const {
    workspaces,
    activeWorkspace,
    projects,
    activeProject,
    activeProjectId,
    activeWorkspaceId,
    isLoading,
  } = useProjectContext();
  const { mayCreate, canAddProject, remainingProjectSlots } = useProjectCreation();

  const label = activeProject?.brand_name || activeProject?.name || 'No project';

  return (
    <Menu>
      <SidebarTextTooltip inRail>
        <MenuTrigger asChild disabled={isLoading}>
          <SidebarIdentButton
            aria-label={label}
            title={label}
            pending={isLoading}
            lead={
              isLoading ? (
                <SidebarMarkPlaceholder />
              ) : (
                <BrandMark
                  name={label}
                  logoUrl={activeProject?.brand.logo_url}
                  websiteUrl={activeProject?.website_url}
                />
              )
            }
          />
        </MenuTrigger>
      </SidebarTextTooltip>
      <MenuContent align="start">
        {workspaces.length > 1 ? (
          <>
            <MenuLabel>Workspaces</MenuLabel>
            <MenuSeparator />
            {workspaces.map((workspace) => {
              const selected = workspace.id === activeWorkspaceId;
              return (
                <MenuItem
                  key={workspace.id}
                  data-active={selected}
                  onSelect={() => selectWorkspace(workspace.id)}
                  icon={<Building2 aria-hidden />}
                  selected={selected}
                >
                  {workspace.name}
                </MenuItem>
              );
            })}
            <MenuSeparator />
          </>
        ) : null}
        <MenuLabel>Projects</MenuLabel>
        <MenuSeparator />
        {projects.length === 0 ? (
          <MenuItem disabled>
            <Text variant="body" tone="ink-2" box="fill" wrap="truncate">
              No projects in {activeWorkspace?.name ?? 'this workspace'}
            </Text>
          </MenuItem>
        ) : null}
        {projects.map((project) => {
          const selected = project.id === activeProjectId;
          return (
            <MenuItem
              key={project.id}
              data-active={selected}
              onFocus={() => {
                if (!selected) void queryClient.prefetchQuery(projectQueries.detail(project.id));
              }}
              onSelect={() => selectProject(project.id)}
              icon={
                <BrandMark
                  name={project.brand_name || project.name}
                  logoUrl={project.brand.logo_url}
                  websiteUrl={project.website_url}
                  placement="inline"
                />
              }
              selected={selected}
            >
              {project.brand_name || project.name}
            </MenuItem>
          );
        })}
        {mayCreate ? (
          <>
            <MenuSeparator />
            <MenuItem
              icon={<Plus aria-hidden />}
              disabled={!canAddProject}
              onSelect={() => router(newProjectDestination(activeWorkspaceId))}
            >
              <span className="grid min-w-0 flex-1">
                <span className="truncate">New project</span>
                {remainingProjectSlots === 0 && (
                  <Text variant="caption">Project limit reached</Text>
                )}
              </span>
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
