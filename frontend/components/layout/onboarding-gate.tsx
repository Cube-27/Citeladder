'use client';

import { useQueryClient } from '@tanstack/react-query';
import { textRole } from '@/components/ui/typography';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/api/query-keys';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { ShellFallback } from '@/components/layout/shell-fallback';
import { useEntitlement } from '@/lib/billing/entitlement-context';
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
 *     before navigating here, but that refetch belongs to the provider it is
 *     leaving: crossing from `(onboarding)` to `(app)` mounts a NEW provider,
 *     and nothing guarantees its list has caught up by this frame. The pending
 *     selection below is the signal that it has not. The skeleton covers the
 *     gap either way rather than rendering the app against an empty context.
 */
export function OnboardingGate({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { projects, isLoading, isError, hasPendingSelection } = useProjectContext();
  // Entitlement decides which controls the shell HAS — the Growth Agent
  // trigger, the capability-gated navigation rows — so waiting for it here is
  // what lets the shell paint complete instead of growing a button and a link
  // a round trip later. It resolves to a settled answer either way: a failed
  // request stops loading and the shell draws with nothing granted.
  const { isLoading: entitlementLoading } = useEntitlement();
  // `hasPendingSelection` is the third loading state, and leaving it out is what
  // made a first project vanish. Arriving from onboarding, this provider is new
  // and its list can still be the pre-create one — `isLoading` false, `projects`
  // empty. Reading that as "this account has no projects" bounced the user back
  // to a blank `/onboarding` seconds after they had finished it; they filled it
  // in again, and the second completion was refused with "not allowed to create
  // more projects" because the first project existed all along. A selection
  // committed but not yet confirmed means the list is still catching up.
  const needsOnboarding = !isLoading && !isError && !hasPendingSelection && projects.length === 0;

  useEffect(() => {
    if (needsOnboarding) {
      // Project availability is client-fetched; the skeleton prevents a page flash.
      router.replace('/onboarding');
    }
  }, [needsOnboarding, router]);

  // A pending selection belongs here as much as an empty list. `dataUpdatedAt`
  // does not advance when a refetch FAILS, so the selection stays unconfirmed —
  // and without this branch the skeleton below would hold forever, with no
  // error and no way to retry. Transient network is exactly when that happens,
  // and it is the failure this whole change is meant to stop looking like a bug.
  if (isError && (projects.length === 0 || hasPendingSelection)) {
    return (
      <main
        id="main"
        className="bg-shell grid min-h-dvh place-items-center p-[var(--page-section-gap)]"
      >
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
      </main>
    );
  }

  // Ahead of the shell, and deliberately the SAME loader the session wait
  // showed: one uninterrupted state covers both round trips, and the chrome
  // that follows it is already complete. `needsOnboarding` holds here too —
  // the redirect is already in flight, and drawing a workspace the visitor is
  // about to be taken out of would only be a flash of the wrong app.
  if (isLoading || entitlementLoading || needsOnboarding || hasPendingSelection) {
    return <ShellFallback />;
  }

  return <>{children}</>;
}
