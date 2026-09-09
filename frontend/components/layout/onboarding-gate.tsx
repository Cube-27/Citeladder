'use client';

import { useQueryClient } from '@tanstack/react-query';
import { textRole } from '@/components/ui/typography';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/api/query-keys';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { PageLoading } from '@/components/layout/page-loading';
import { useProjectContext } from '@/lib/project/project-context';

/**
 * First-run gate — sends users with zero projects to `/onboarding`.
 *
 * Sits between ProjectProvider and AppShell so every `(app)` route is covered
 * by one redirect instead of each screen inventing its own empty state.
 *
 * Query failures remain on this route with Retry; an empty error result is
 * never evidence that the account needs onboarding.
 *
 * Two project-loading races:
 *
 * (a) **No flash for users who have projects.** `projects` is `[]` while the
 *     query is still in flight, which is indistinguishable from "no projects"
 *     if you only look at length. Waiting for `isLoading` to settle is what
 *     stops an existing user being bounced to onboarding for a frame.
 *
 * (b) **No bounce-back after confirm.** Onboarding awaits the projects refetch
 *     before navigating here, so by the time this mounts the list is warm. The
 *     skeleton below covers the gap either way rather than rendering the app
 *     against an empty context.
 */
export function OnboardingGate({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { projects, isLoading, isError } = useProjectContext();
  const needsOnboarding = !isLoading && !isError && projects.length === 0;

  useEffect(() => {
    if (needsOnboarding) {
      // Project availability is client-fetched; the skeleton prevents a page flash.
      router.replace('/onboarding');
    }
  }, [needsOnboarding, router]);

  if (isError && projects.length === 0) {
    return (
      <Alert tone="warning" className="max-w-lg">
        <h1 className={textRole('sectionTitle')}>Projects could not be loaded</h1>
        <p>Your session is active. Retry to load your projects.</p>
        <Button
          variant="secondary"
          onClick={() => {
            void queryClient.refetchQueries({ queryKey: queryKeys.projects.list() });
          }}
        >
          Retry
        </Button>
      </Alert>
    );
  }

  // Inside the shell, so this is the ordinary content-pane loader every screen
  // shows — the chrome around it is already drawn and does not move.
  if (isLoading || needsOnboarding) return <PageLoading label="Loading your workspace…" />;

  return <>{children}</>;
}
