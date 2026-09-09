'use client';

import type { ReactNode } from 'react';

import { SessionGuard } from '@/lib/auth/session-guard';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { ProjectProvider } from '@/lib/project/project-context';

/**
 * Onboarding is authenticated but deliberately has no application shell. It
 * still needs the same project context as the app because completion selects
 * the newly created project before navigating to the command center.
 */
export default function OnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // Provider outside the guard so the project list loads alongside `me`
    // rather than after it — see `app/(app)/layout.tsx`.
    <ProjectProvider>
      <SessionGuard fallback={<OnboardingFallback />}>
        <EntitlementProvider>{children}</EntitlementProvider>
      </SessionGuard>
    </ProjectProvider>
  );
}

function OnboardingFallback() {
  return (
    <main
      id="main"
      className="bg-shell grid min-h-dvh place-items-center p-[var(--page-section-gap)]"
    >
      <p className="text-muted text-sm">Loading your workspace…</p>
    </main>
  );
}
