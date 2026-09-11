'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
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
import { useSelectProject, workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';
import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';

/**
 * ProjectSwitcher (F5) — brand avatar + active project name with a dropdown of
 * all projects in the workspace.
 *
 * Selection goes through the shared navigation owner so the context, the
 * device storage and the URL cannot disagree: the destination NAMES the
 * chosen project, which is what the arriving context resolves against. An
 * additional project carries its target workspace for the same reason — a
 * refresh of the creation route must not re-target it.
 */
/** Where "New project" goes, carrying the workspace it will be created in. */
function newProjectHref(workspaceId: string | null): string {
  const params = new URLSearchParams({ new: '1' });
  if (!workspaceId) return `/onboarding?${params.toString()}`;
  return workspaceDestination('/onboarding', params, workspaceId);
}

export function ProjectSwitcher({ className }: Readonly<{ className?: string }>) {
  const router = useRouter();
  const selectProject = useSelectProject();
  const { projects, activeProject, activeProjectId, activeWorkspaceId, isLoading, isError } =
    useProjectContext();
  const { usage } = useEntitlement();
  const remainingProjectSlots = capabilityRemaining(usage, PROJECT_SLOTS_CAPABILITY);
  const canAddProject =
    !isError && remainingProjectSlots !== undefined && remainingProjectSlots > 0;

  const label = activeProject?.brand_name ?? activeProject?.name ?? 'No project';

  return (
    <Dropdown>
      <DropdownTrigger
        className={cn(
          'focus-ring hover:bg-panel/70 flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-1 text-left transition-colors disabled:pointer-events-none disabled:opacity-50',
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
        <DropdownLabel>Projects</DropdownLabel>
        <DropdownSeparator />
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
            <DropdownItem onSelect={() => router.push(newProjectHref(activeWorkspaceId))}>
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
