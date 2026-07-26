'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import { useActiveProject } from '@/lib/project/project-context';
import { setupErrorMessage } from '@/lib/setup/forms';

import { BrandProfilePanel } from './brand-profile-panel';

/**
 * Workspace-owned editor for the curated brand knowledge used by assisted
 * features. Project setup deliberately owns only identity and audit defaults;
 * this screen owns the richer, separately-maintained knowledge profile.
 *
 * Midnight composition: accent-dot eyebrow + display heading over the editor
 * card; the no-project state is the standard eyebrow + display-heading +
 * ghost-CTA empty card.
 */
export function BrandKnowledgeScreen() {
  const project = useActiveProject();
  const projectId = project?.id;
  const profileQuery = useQuery({
    queryKey: projectId
      ? queryKeys.projects.brandProfile(projectId)
      : ['projects', 'brand-profile', 'none'],
    queryFn: ({ signal }) => projectsApi.getBrandProfile(projectId as string, { signal }),
    enabled: Boolean(projectId),
  });

  if (!project) {
    return (
      <EmptyState
        icon={BookOpen}
        heading="Create a project first"
        description="Brand knowledge belongs to a project."
        action={
          <Button asChild size="md">
            <Link href="/projects">Go to Projects</Link>
          </Button>
        }
      />
    );
  }

  if (profileQuery.isLoading) {
    return (
      <div className="grid gap-4" aria-hidden>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (profileQuery.error) {
    return <Alert tone="danger">{setupErrorMessage(profileQuery.error)}</Alert>;
  }
  if (!profileQuery.data) return null;

  // Full width, and no page header: the shell's top bar already reads "Brand
  // knowledge", so the eyebrow + h2 + strapline repeated the title three more
  // times inside a rail that left half the screen empty.
  //
  // Keyed on the PROJECT, not on `updated_at`. Keying on the timestamp remounted
  // the whole panel every time a save wrote the fresh profile into the cache —
  // a visible flash of the entire card on button press, and the "saved" notice
  // was set on an already-unmounted component so it never appeared. The panel
  // syncs its own draft from the mutation result; the key only needs to reset it
  // when the user switches to a different project.
  return (
    <div className="grid gap-4">
      <BrandProfilePanel key={project.id} projectId={project.id} profile={profileQuery.data} />
    </div>
  );
}
