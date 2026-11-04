'use client';

import { Building2, Check, ChevronsUpDown, Plus, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip } from '@/components/ui/tooltip';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { BrandMark } from '@/components/ui/brand-mark';
import {
  newProjectDestination,
  scopedNavigationDestination,
  useSelectProject,
  useSelectWorkspace,
} from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';

import { useProjectCreation } from '@/components/layout/use-project-creation';

/**
 * ProjectSwitcher (F5) — brand avatar + active project name with a dropdown of
 * the workspaces the reader can select and the projects inside the active one.
 *
 * Selection goes through the shared navigation owners so the context, the
 * device storage and the URL cannot disagree: the destination NAMES the
 * chosen project, which is what the arriving context resolves against. An
 * additional project carries its target workspace for the same reason — a
 * refresh of the creation route must not re-target it.
 *
 * A workspace is selectable INDEPENDENTLY of its projects (plan §2.4): an
 * empty workspace appears here like any other and stays manageable, because
 * choosing one is an explicit act rather than something inferred from a
 * project. The workspace section is shown only when there is more than one to
 * choose between, so the ordinary single-workspace account sees exactly the
 * switcher it saw before.
 */
export function ProjectSwitcher({ className }: Readonly<{ className?: string }>) {
  const router = useNavigate();
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

  const label = activeProject?.brand_name ?? activeProject?.name ?? 'No project';

  return (
    <div className={cn('flex w-full min-w-0 items-center gap-1', className)}>
      <Menu>
        <MenuTrigger
          className="focus-ring hover:bg-surface-sunken active:bg-surface-sunken data-[state=open]:bg-surface-sunken hover:text-ink disabled:bg-surface-sunken disabled:text-ink-muted flex h-[var(--control-md)] min-w-0 flex-1 items-center gap-2 rounded-md px-3 text-left transition-colors disabled:pointer-events-none"
          disabled={isLoading}
        >
          <BrandMark
            name={label}
            logoUrl={activeProject?.brand.logo_url}
            websiteUrl={activeProject?.website_url}
          />
          <span className={textRole('itemTitle', 'min-w-0 flex-1 truncate')}>{label}</span>
          <ChevronsUpDown className="text-ink-muted size-3.5 shrink-0" aria-hidden />
        </MenuTrigger>
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
                    // A different workspace shares none of this route's
                    // resources — a run id, a crawl id, a selected category all
                    // belong to the one being left — so a switch lands on the
                    // new workspace's Overview rather than carrying a path that
                    // will only resolve to "unavailable". Re-picking the active
                    // workspace stays the no-op it looks like.
                    onSelect={() =>
                      selectWorkspace(workspace.id, selected ? undefined : '/projects')
                    }
                  >
                    <Building2 className="text-ink-muted size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    {selected ? (
                      <Check className="text-accent size-4 shrink-0" aria-hidden />
                    ) : null}
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
              <span className="text-ink-muted min-w-0 flex-1 truncate">
                No projects in {activeWorkspace?.name ?? 'this workspace'}
              </span>
            </MenuItem>
          ) : null}
          {projects.map((project) => {
            const selected = project.id === activeProjectId;
            return (
              <MenuItem
                key={project.id}
                data-active={selected}
                onSelect={() => selectProject(project.id)}
              >
                <BrandMark
                  name={project.brand_name || project.name}
                  logoUrl={project.brand.logo_url}
                  websiteUrl={project.website_url}
                />
                <span className="min-w-0 flex-1 truncate">
                  {project.brand_name || project.name}
                </span>
                {selected ? <Check className="text-accent size-4 shrink-0" aria-hidden /> : null}
              </MenuItem>
            );
          })}
          {mayCreate ? (
            <>
              <MenuSeparator />
              <MenuItem
                disabled={!canAddProject}
                onSelect={() => router(newProjectDestination(activeWorkspaceId))}
              >
                <span
                  aria-hidden
                  className="bg-surface-sunken text-ink-secondary flex size-6 shrink-0 items-center justify-center rounded-md"
                >
                  <Plus className="size-4" />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">New project</span>
                  {remainingProjectSlots === 0 && (
                    <span className="type-caption">Project limit reached</span>
                  )}
                </span>
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      <SettingsLink />
    </div>
  );
}

/** The gear beside the project name: the workspace's settings, one click away. */
function SettingsLink() {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const href = scopedNavigationDestination(
    '/settings',
    'workspace',
    activeProjectId,
    activeWorkspaceId,
  );
  return (
    <Tooltip content="Settings" side="bottom" describe={false}>
      <Button variant="ghost" asChild className="w-[var(--control-md)] gap-0 px-0">
        <Link to={href} aria-label="Settings">
          <Icon icon={Settings} />
        </Link>
      </Button>
    </Tooltip>
  );
}
