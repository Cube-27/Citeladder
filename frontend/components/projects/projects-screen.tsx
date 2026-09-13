'use client';

import { FolderOpen, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoading } from '@/components/layout/page-loading';
import type { Project } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';
import { newProjectDestination } from '@/lib/navigation/project-destination';

import { ProjectEditPanel } from './project-edit-panel';
import { DashboardScreen } from './dashboard-screen';

/**
 * `/projects` — manage every project in the workspace.
 *
 * Built for agencies and multi-brand teams, who are the users with more than
 * one: the project switcher in the sidebar is fine for hopping between two, but
 * not for seeing what you have. This takes the sidebar slot the retired "Setup"
 * item left behind, and owns the "add another project" entry point that
 * `/setup/new` used to.
 *
 * Creating goes through `/onboarding?new=1` — the same discovery flow as the
 * first project, because a second brand needs its competitors and prompts found
 * just as much as the first did.
 */
export function ProjectsScreen() {
  const { projects, projectsSettled, activeWorkspaceId } = useProjectContext();
  const [editing, setEditing] = useState<Project | null>(null);

  // "No projects yet" is a CLAIM about the workspace, so it needs a settled
  // answer. The gate does not supply one: its `ready` state is reached by a
  // directly-resolved project alone, deliberately, so a brand-new project is
  // usable before the list reconciles — and the list is `[]` while it loads.
  // Reading that as "no projects" is what showed this empty state to someone
  // who had just created their first project, until they refreshed.
  if (projects.length === 0 && !projectsSettled) {
    return <PageLoading label="Loading your projects…" />;
  }
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        headingLevel={1}
        heading="No projects yet"
        description="Add a brand to start tracking how AI answers describe it."
        action={
          <Button asChild>
            <Link href={newProjectDestination(activeWorkspaceId)}>
              <Plus className="size-4" aria-hidden />
              Add project
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-[var(--page-section-gap)]">
      <DashboardScreen onEditProject={(project) => setEditing(project)} />

      {editing ? (
        <ProjectEditPanel
          key={editing.id}
          project={editing}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
