'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
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
  const router = useRouter();
  const { projects, isLoading } = useProjectContext();
  const { entitlement, isLoading: entitlementLoading } = useEntitlement();
  const projectLimit = capabilityLimit(entitlement, PROJECT_SLOTS_CAPABILITY);
  const loading = isLoading || entitlementLoading;
  const additionalProjectBlocked =
    !loading &&
    projects.length > 0 &&
    projectLimit !== null &&
    (projectLimit === undefined || projects.length >= projectLimit);

  useEffect(() => {
    if (additionalProjectBlocked) router.replace('/projects');
  }, [additionalProjectBlocked, router]);

  if (loading || additionalProjectBlocked) return null;
  return <OnboardingScreen />;
}
