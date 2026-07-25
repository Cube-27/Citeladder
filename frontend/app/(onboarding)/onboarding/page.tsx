'use client';

import { Suspense } from 'react';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';

/**
 * `/onboarding` — project creation via AI auto-discovery. Replaces the retired
 * `/setup`, `/setup/new` and `/setup/[projectId]` routes.
 *
 * Wrapped in Suspense because the screen reads `useSearchParams` (`?new=1`),
 * which opts the subtree into client-side rendering.
 */
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingScreen />
    </Suspense>
  );
}
