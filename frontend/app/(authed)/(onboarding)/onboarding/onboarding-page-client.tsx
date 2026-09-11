'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, type ReactNode } from 'react';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/api/query-keys';
import { capabilityRemaining, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext } from '@/lib/project/project-context';

export function OnboardingPageClient() {
  return (
    <Suspense fallback={null}>
      <ProjectSetupGate />
    </Suspense>
  );
}

/**
 * The creation screen's own precondition check.
 *
 * It asks about the WORKSPACE, not the account: whether this workspace is
 * resolved, and whether its allowance leaves room for another project. A
 * workspace with no projects is a normal starting point here, so an empty
 * list is never an error.
 */
function ProjectSetupGate() {
  const queryClient = useQueryClient();
  const { status, activeWorkspaceId, retry: retryContext } = useProjectContext();
  const { entitlement, isLoading: entitlementLoading } = useEntitlement();

  const retry = () => {
    retryContext();
    void queryClient.refetchQueries({ queryKey: queryKeys.billing.all });
  };

  const remainingProjectSlots = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);

  // Every settled FAILURE is answered before the loading branch. A failed
  // workspace read leaves `activeWorkspaceId` null forever, so testing for it
  // first hid the retry behind a spinner that never resolved.
  if (status === 'error') {
    return (
      <ProjectSetupBlocked title="Your workspace could not be loaded" onRetry={retry}>
        We could not confirm which workspace to create this project in. Retry to load it again.
      </ProjectSetupBlocked>
    );
  }
  if (status === 'unavailable') {
    // Reached by linking here with a `?project=` that is missing, unauthorized,
    // or contradicts the workspace. Creating a project is not the answer to a
    // request that named a different one.
    return (
      <ProjectSetupBlocked title="That project is unavailable">
        The project this link names could not be opened. Go back to your projects to continue.
      </ProjectSetupBlocked>
    );
  }
  if (status === 'resolving' || activeWorkspaceId === null || entitlementLoading) {
    return null;
  }
  if (remainingProjectSlots === undefined) {
    return (
      <ProjectSetupBlocked title="Project access unavailable" onRetry={retry}>
        Your project allowance is unresolved. Retry to check for updated access.
      </ProjectSetupBlocked>
    );
  }
  if (remainingProjectSlots === 0) {
    return (
      <ProjectSetupBlocked title="Project limit reached">
        Your current access does not include another project.
      </ProjectSetupBlocked>
    );
  }
  return <OnboardingScreen />;
}

function ProjectSetupBlocked({
  title,
  children,
  onRetry,
}: Readonly<{ title: string; children: ReactNode; onRetry?: () => void }>) {
  return (
    <main
      id="main"
      className="bg-shell grid min-h-dvh place-items-center p-[var(--page-section-gap)]"
    >
      <Alert tone="warning" className="max-w-lg">
        <div className="grid gap-4">
          <h1 className="font-display text-lg font-semibold">{title}</h1>
          <p>{children}</p>
          {onRetry && (
            <Button onClick={onRetry} className="w-fit">
              Retry
            </Button>
          )}
          <Button asChild variant="secondary" className="w-fit">
            <Link href="/projects">Back to projects</Link>
          </Button>
        </div>
      </Alert>
    </main>
  );
}
