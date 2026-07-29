'use client';

import { Check, FolderOpen, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import type { Project } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';

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
  const router = useRouter();
  const { projects, activeProjectId, setActiveProjectId, isLoading } = useProjectContext();
  const [editing, setEditing] = useState<Project | null>(null);

  if (isLoading) {
    return (
      <div className="grid gap-2" aria-hidden>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        heading="No projects yet"
        description="Add a brand to start tracking how AI answers describe it."
        action={
          <Button onClick={() => router.push('/onboarding?new=1')}>
            <Plus className="size-4" aria-hidden />
            Add project
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-8">
      <DashboardScreen />

      <section aria-labelledby="manage-projects">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="manage-projects" className="text-foreground text-heading-sm">
            Manage projects
          </h2>
          <Button onClick={() => router.push('/onboarding?new=1')}>
            <Plus className="size-4" aria-hidden />
            Add project
          </Button>
        </div>
        <div className="flex items-center justify-end">
          <span className="text-muted text-xs">Choose the active brand for this Dashboard.</span>
        </div>

        <Card className="border-border overflow-hidden shadow-xs">
          <CardContent className="p-0">
            <ul className="divide-border grid list-none divide-y p-0">
              {projects.map((project) => {
                const isActive = project.id === activeProjectId;
                const label = project.brand_name || project.name;
                return (
                  <li key={project.id}>
                    <div
                      className={cn(
                        'flex items-center gap-3 pe-4 transition-colors',
                        isActive ? 'bg-indigo-50/40' : 'hover:bg-accent/60',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveProjectId(project.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className="focus-ring flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3.5 text-left"
                      >
                        <BrandLogo
                          name={label}
                          logoUrl={project.brand.logo_url}
                          websiteUrl={project.website_url}
                          size="md"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground block truncate text-sm font-semibold">
                            {label}
                          </span>
                          {project.website_url ? (
                            <span className="text-muted-foreground block truncate text-xs">
                              {project.website_url}
                            </span>
                          ) : null}
                        </span>
                        {isActive ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                            <Check className="size-3.5" aria-hidden />
                            Active
                          </span>
                        ) : null}
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(project)}
                        aria-label={`Edit ${label}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Keyed so switching rows remounts the panel with that project's values
          — the fields seed from props in useState, which only reads once. */}
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
      </section>
    </div>
  );
}
