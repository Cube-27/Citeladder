import { Suspense, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { AppScrollRestoration } from '@/components/layout/app-scroll-restoration';
import { AppShell } from '@/components/layout/app-shell';
import { FirstFrame, HeldContent } from '@/components/layout/first-frame';
import { OnboardingGate } from '@/components/layout/onboarding-gate';
import { RouteLoadingScreen } from '@/components/layout/page-shell';
import { UserMenuController } from '@/components/layout/user-menu';
import { ToastProvider } from '@/components/ui/toast';
import { SessionGuard } from '@/lib/auth/session-guard';
import { PolicyAcceptanceGate } from '@/components/auth/policy-acceptance';
import { EntitlementProvider } from '@/lib/billing/entitlement-context';
import { isFlowPath } from '@/lib/navigation/app-routes';
import { ProjectProvider } from '@/lib/project/project-context';
import { useEngineCatalog } from '@/lib/providers/engines';
import { WorkspaceAccessGate } from '@/components/auth/workspace-access-gate';

/**
 * Authenticated route root.
 *
 * Project context starts before the session guard so its workspace bootstrap
 * runs in parallel with `me`, while the guard remains the only place that
 * decides whether protected content may render.
 *
 * The account controller sits here rather than in `AppShell` because signing
 * out is an authenticated-session affordance, not an application-chrome one.
 * `/onboarding` is a sibling of `ApplicationRouteLayout`, so a shell-owned
 * controller left the one route a new account actually lands on with no way to
 * sign out at all. Every trigger still chooses its own presenter; this only
 * decides where the state lives.
 *
 * Every wait above the page draws `FirstFrame`, and a gate still answering
 * holds the content slot (`HeldContent`) rather than replacing the tree.
 */
export function PrivateRouteLayout() {
  // Engine names and order come from the provider catalogue; read it alongside
  // the workspace bootstrap so screens render with labels already cached.
  useEngineCatalog();
  const flow = isFlowPath(useLocation().pathname ?? '');
  return (
    <Suspense fallback={<FirstFrame />}>
      <ProjectProvider>
        <SessionGuard fallback={sessionFallback}>
          <WorkspaceAccessGate>
            <PolicyAcceptanceGate>
              <EntitlementProvider>
                <UserMenuController>
                  {flow ? (
                    <HeldContent frame={<FirstFrame />}>
                      <Outlet />
                    </HeldContent>
                  ) : (
                    <Outlet />
                  )}
                </UserMenuController>
              </EntitlementProvider>
            </PolicyAcceptanceGate>
          </WorkspaceAccessGate>
        </SessionGuard>
      </ProjectProvider>
    </Suspense>
  );
}

function sessionFallback(content?: ReactNode) {
  return <FirstFrame>{content}</FirstFrame>;
}

/** Authenticated application chrome and its project-route recovery gate. */
export function ApplicationRouteLayout() {
  return (
    <ToastProvider>
      <AppScrollRestoration />
      <AppShell>
        <HeldContent frame={<RouteLoadingScreen />}>
          <OnboardingGate>
            <Outlet />
          </OnboardingGate>
        </HeldContent>
      </AppShell>
    </ToastProvider>
  );
}
