'use client';

import { FolderOpen, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { Project } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';

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
  const { projects } = useProjectContext();
  const [editing, setEditing] = useState<Project | null>(null);

  // OnboardingGate (the layout wrapper) already gates on this exact
  // useProjectContext().isLoading and shows PageLoading, so by the time this
  // screen mounts the project list has settled.
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        headingLevel={1}
        heading="No projects yet"
        description="Add a brand to start tracking how AI answers describe it."
        action={
          <Button asChild>
            <Link href="/onboarding?new=1">
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
