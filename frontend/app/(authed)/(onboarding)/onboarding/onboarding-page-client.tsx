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
  const { usage, isLoading: entitlementLoading, usageIsLoading, usageIsError } = useEntitlement();

  const retry = () => {
    retryContext();
    void queryClient.refetchQueries({ queryKey: queryKeys.billing.allUsage() });
  };

  const remainingProjectSlots = capabilityRemaining(usage, PROJECT_SLOTS_CAPABILITY);
  const loading =
    status === 'resolving' || activeWorkspaceId === null || entitlementLoading || usageIsLoading;
  const additionalProjectBlocked = !loading && remainingProjectSlots === 0;

  if (loading) return null;
  if (status === 'error') {
    return (
      <ProjectSetupBlocked title="Your workspace could not be loaded" onRetry={retry}>
        We could not confirm which workspace to create this project in. Retry to load it again.
      </ProjectSetupBlocked>
    );
  }
  if (usageIsError) {
    return (
      <ProjectSetupBlocked title="Project allowance could not be loaded" onRetry={retry}>
        We could not load your workspace usage. Retry to check your project allowance.
      </ProjectSetupBlocked>
    );
  }
  if (remainingProjectSlots === undefined) {
    return (
      <ProjectSetupBlocked title="Project access unavailable" onRetry={retry}>
        Your project allowance is unresolved. Retry to check for updated access.
      </ProjectSetupBlocked>
    );
  }
  if (additionalProjectBlocked) {
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
