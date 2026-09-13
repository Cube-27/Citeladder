import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { OnboardingPageClient } from '@/components/onboarding/onboarding-page-client';
import { AppShell } from '@/components/layout/app-shell';
import { OnboardingGate } from '@/components/layout/onboarding-gate';
import { ShellFallback } from '@/components/layout/shell-fallback';
import { ProjectsScreen } from '@/components/projects/projects-screen';
import { ProductTourProvider } from '@/components/tour/product-tour-provider';
import { ToastProvider } from '@/components/ui/toast';
import { SessionGuard } from '@/lib/auth/session-guard';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { ProjectProvider } from '@/lib/project/project-context';

/**
 * Authenticated route root.
 *
 * Project context starts before the session guard so its workspace bootstrap
 * runs in parallel with `me`, while the guard remains the only place that
 * decides whether protected content may render.
 */
export function PrivateRouteLayout() {
  return (
    <Suspense fallback={<ShellFallback />}>
      <ProjectProvider>
        <SessionGuard fallback={(content) => <ShellFallback>{content}</ShellFallback>}>
          <EntitlementProvider>
            <Outlet />
          </EntitlementProvider>
        </SessionGuard>
      </ProjectProvider>
    </Suspense>
  );
}

/** Authenticated application chrome and its project-route recovery gate. */
export function ApplicationRouteLayout() {
  return (
    <ProductTourProvider>
      <ToastProvider>
        <AppShell>
          <OnboardingGate>
            <Outlet />
          </OnboardingGate>
        </AppShell>
      </ToastProvider>
    </ProductTourProvider>
  );
}

/** `/onboarding` creation flow and its workspace/entitlement precondition gate. */
export function OnboardingRoute() {
  return <OnboardingPageClient />;
}

/** `/projects` workspace project management screen. */
export function ProjectsRoute() {
  return <ProjectsScreen />;
}
