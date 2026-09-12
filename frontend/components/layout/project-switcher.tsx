'use client';

import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { BrandLogo } from '@/components/ui/brand-logo';
import {
  newProjectDestination,
  useSelectProject,
  useSelectWorkspace,
} from '@/lib/navigation/project-destination';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';
import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';

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
  const router = useRouter();
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
    isError,
  } = useProjectContext();
  const { entitlement } = useEntitlement();
  const remainingProjectSlots = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  // Both must permit it: the role, and the workspace's remaining allowance.
  const mayCreate = useWorkspaceCapability('write');
  const canAddProject =
    !isError && mayCreate && remainingProjectSlots !== undefined && remainingProjectSlots > 0;

  const label = activeProject?.brand_name ?? activeProject?.name ?? 'No project';

  return (
    <Dropdown>
      <DropdownTrigger
        className={cn(
          'focus-ring hover:bg-accent-soft hover:text-accent-text flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1 text-left transition-colors disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        disabled={isLoading}
      >
        <BrandLogo
          name={label}
          logoUrl={activeProject?.brand.logo_url}
          websiteUrl={activeProject?.website_url}
          size="sm"
          className="bg-foreground text-background size-6.5 rounded-[var(--radius-control)]"
        />
        <span className={textRole('bodyStrong', 'min-w-0 flex-1 truncate tracking-tight')}>
          {label}
        </span>
        <ChevronsUpDown className="text-muted size-3.5 shrink-0" aria-hidden />
      </DropdownTrigger>
      <DropdownContent align="start" className="w-56">
        {workspaces.length > 1 ? (
          <>
            <DropdownLabel>Workspaces</DropdownLabel>
            <DropdownSeparator />
            {workspaces.map((workspace) => {
              const selected = workspace.id === activeWorkspaceId;
              return (
                <DropdownItem
                  key={workspace.id}
                  data-active={selected}
                  // A different workspace shares none of this route's
                  // resources — a run id, a crawl id, a selected category all
                  // belong to the one being left — so a switch lands on the
                  // new workspace's Overview rather than carrying a path that
                  // will only resolve to "unavailable". Re-picking the active
                  // workspace stays the no-op it looks like.
                  onSelect={() => selectWorkspace(workspace.id, selected ? undefined : '/projects')}
                >
                  <Building2 className="text-muted size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  {selected ? <Check className="text-accent size-4 shrink-0" aria-hidden /> : null}
                </DropdownItem>
              );
            })}
            <DropdownSeparator />
          </>
        ) : null}
        <DropdownLabel>Projects</DropdownLabel>
        <DropdownSeparator />
        {projects.length === 0 ? (
          <DropdownItem disabled>
            <span className="text-muted min-w-0 flex-1 truncate">
              No projects in {activeWorkspace?.name ?? 'this workspace'}
            </span>
          </DropdownItem>
        ) : null}
        {projects.map((project) => {
          const selected = project.id === activeProjectId;
          return (
            <DropdownItem
              key={project.id}
              data-active={selected}
              onSelect={() => selectProject(project.id)}
            >
              <BrandLogo
                name={project.brand_name || project.name}
                logoUrl={project.brand.logo_url}
                websiteUrl={project.website_url}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate">{project.brand_name || project.name}</span>
              {selected ? <Check className="text-accent size-4 shrink-0" aria-hidden /> : null}
            </DropdownItem>
          );
        })}
        {canAddProject ? (
          <>
            <DropdownSeparator />
            <DropdownItem onSelect={() => router.push(newProjectDestination(activeWorkspaceId))}>
              <span
                aria-hidden
                className="bg-accent-soft text-accent-text flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)]"
              >
                <Plus className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">New project</span>
            </DropdownItem>
          </>
        ) : null}
      </DropdownContent>
    </Dropdown>
  );
}
