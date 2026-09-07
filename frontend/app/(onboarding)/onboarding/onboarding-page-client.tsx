'use client';

import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { capabilityLimit, useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext } from '@/lib/project/project-context';

export function OnboardingPageClient() {
  return (
    <Suspense fallback={null}>
      <OnboardingGate />
    </Suspense>
  );
}

function OnboardingGate() {
  const { projects, isLoading, isError: projectsError } = useProjectContext();
  const { entitlement, isLoading: entitlementLoading } = useEntitlement();
  const projectLimit = capabilityLimit(entitlement, PROJECT_SLOTS_CAPABILITY);
  const loading = isLoading || entitlementLoading;
  const additionalProjectBlocked =
    !loading &&
    projects.length > 0 &&
    (projectLimit === undefined || projects.length >= projectLimit);

  if (loading) return null;
  if (projectsError) {
    return (
      <ProjectSetupBlocked title="Project access unavailable">
        We could not verify your existing projects. Return to your projects and try again.
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
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <main
      id="main"
      className="bg-shell grid min-h-dvh place-items-center p-[var(--page-section-gap)]"
    >
      <Alert tone="warning" className="max-w-lg">
        <div className="grid gap-4">
          <h1 className="font-display text-lg font-semibold">{title}</h1>
          <p>{children}</p>
          <Button asChild variant="secondary" className="w-fit">
            <Link href="/projects">Back to projects</Link>
          </Button>
        </div>
      </Alert>
    </main>
  );
}
