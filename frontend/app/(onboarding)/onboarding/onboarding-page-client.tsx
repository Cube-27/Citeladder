'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { ADDITIONAL_PROJECT_CREATION_ENABLED } from '@/lib/config/billing';
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
  const searchParams = useSearchParams();
  const { projects, isLoading } = useProjectContext();
  const additionalProjectRequested =
    !ADDITIONAL_PROJECT_CREATION_ENABLED && searchParams.get('new') === '1';
  const additionalProjectBlocked = additionalProjectRequested && !isLoading && projects.length > 0;

  useEffect(() => {
    if (additionalProjectBlocked) router.replace('/projects');
  }, [additionalProjectBlocked, router]);

  if ((additionalProjectRequested && isLoading) || additionalProjectBlocked) return null;
  return <OnboardingScreen />;
}
